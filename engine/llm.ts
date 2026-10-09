/**
 * JSON chat calls against any OpenAI-compatible endpoint. Free providers are presets; any other
 * endpoint works by giving its base URL. Keys only ever travel in the Authorization header.
 */

export class LlmError extends Error {
  override name = 'LlmError';
}

export interface JsonRequest<T> {
  system: string;
  user: string;
  /** Checks and shapes the parsed reply; throwing gets the model one retry with the error. */
  validate?: (o: unknown) => T;
  temperature?: number;
  maxTokens?: number;
}

export interface Llm {
  readonly provider: string;
  readonly model: string;
  /** Calls made through this object, retries included. */
  readonly calls: number;
  json<T>(req: JsonRequest<T>): Promise<T>;
}

/** Free (or local) by default. Groq's free tier needs no card, so it is the default. */
export const PROVIDERS = {
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-oss-120b:free' },
  ollama: { baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-5-mini' },
} as const;
export type ProviderName = keyof typeof PROVIDERS | 'custom';

const LOCAL = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Model URLs must be https, or plain http on this machine (Ollama). Nothing else is fetched. */
export function checkBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new LlmError(`The model base URL "${raw}" is not a URL.`);
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL.has(url.hostname))) {
    throw new LlmError('The model base URL must use https (plain http is allowed only on localhost).');
  }
  if (url.username || url.password) throw new LlmError('Put the API key in the key setting, not in the URL.');
  return url.toString().replace(/\/+$/, '');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface OpenAiCompatibleOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  userAgent?: string;
}

export function openAiCompatible(opts: OpenAiCompatibleOptions): Llm {
  const { apiKey, model, fetchImpl = globalThis.fetch, timeoutMs = 120_000, retries = 4, userAgent = 'audience-rehearsal' } = opts;
  const baseUrl = checkBaseUrl(opts.baseUrl);
  const url = `${baseUrl}/chat/completions`;
  let calls = 0;

  async function send(messages: { role: string; content: string }[], temperature: number, maxTokens: number): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      calls++;
      let res: Response;
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': userAgent, authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, response_format: { type: 'json_object' } }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        if (attempt < retries) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        throw new LlmError(`Could not reach the model at ${new URL(baseUrl).host} (${(e as Error).message}).`);
      }
      // free tiers rate-limit per minute: wait it out rather than failing the rehearsal
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const after = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(after) && after > 0 ? Math.min(after, 60) * 1000 : 2000 * 2 ** attempt);
        continue;
      }
      const body = (await res.json().catch(() => null)) as { error?: { message?: string }; choices?: { message?: { content?: unknown } }[] } | null;
      if (!res.ok) throw new LlmError(`The model refused the call (HTTP ${res.status}${body?.error?.message ? `: ${String(body.error.message).slice(0, 200)}` : ''}).`);
      const text = body?.choices?.[0]?.message?.content;
      if (typeof text !== 'string') throw new LlmError('The model returned no text.');
      return text;
    }
  }

  return {
    provider: opts.provider ?? 'custom',
    model,
    get calls() {
      return calls;
    },
    /** One prompt, parsed as JSON and checked by validate(); a bad shape gets one retry with the error. */
    async json<T>({ system, user, validate = (x: unknown) => x as T, temperature = 0.8, maxTokens = 4096 }: JsonRequest<T>): Promise<T> {
      const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
      for (let shapeTry = 0; ; shapeTry++) {
        const text = await send(messages, temperature, maxTokens);
        try {
          return validate(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')));
        } catch (e) {
          if (shapeTry) throw new LlmError(`The model returned an unusable answer: ${(e as Error).message}`);
          messages.push({ role: 'assistant', content: text }, { role: 'user', content: `That was invalid (${(e as Error).message}). Reply again with valid JSON only.` });
        }
      }
    },
  };
}

/** Counts calls for one rehearsal, so a shared client still reports per-run numbers. */
export function counting(llm: Llm): Llm {
  let calls = 0;
  return {
    provider: llm.provider,
    model: llm.model,
    get calls() {
      return calls;
    },
    async json<T>(req: JsonRequest<T>): Promise<T> {
      const before = llm.calls;
      try {
        return await llm.json(req);
      } finally {
        calls += Math.max(llm.calls - before, 1);
      }
    },
  };
}

export interface LlmEnv {
  REHEARSAL_LLM_PROVIDER?: string;
  REHEARSAL_LLM_API_KEY?: string;
  REHEARSAL_LLM_BASE_URL?: string;
  REHEARSAL_LLM_MODEL?: string;
  /** Shared with Creator OS, so one free key covers both. */
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
}

/**
 * Builds the model client from the environment, or null when no key is set (the engine then runs its
 * labelled offline estimate). Ollama needs no key.
 */
export function llmFromEnv(env: LlmEnv = process.env as LlmEnv, extra: Partial<OpenAiCompatibleOptions> = {}): Llm | null {
  const provider = (env.REHEARSAL_LLM_PROVIDER || 'groq') as ProviderName;
  if (provider !== 'custom' && !(provider in PROVIDERS)) throw new LlmError(`Unknown model provider "${provider}". Use one of ${[...Object.keys(PROVIDERS), 'custom'].join(', ')}.`);
  const preset = provider === 'custom' ? null : PROVIDERS[provider];
  const apiKey = env.REHEARSAL_LLM_API_KEY || env.LLM_API_KEY || (provider === 'ollama' ? 'ollama' : '');
  if (!apiKey) return null;
  // LLM_BASE_URL (Creator OS's setting) applies only when no provider is named here
  const baseUrl = env.REHEARSAL_LLM_BASE_URL || (env.REHEARSAL_LLM_PROVIDER ? preset?.baseUrl : env.LLM_BASE_URL || preset?.baseUrl);
  if (!baseUrl) throw new LlmError('REHEARSAL_LLM_BASE_URL is required with the custom provider.');
  const model = env.REHEARSAL_LLM_MODEL || preset?.model;
  if (!model) throw new LlmError('REHEARSAL_LLM_MODEL is required with the custom provider.');
  return openAiCompatible({ apiKey, baseUrl, model, provider, ...extra });
}
