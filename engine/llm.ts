/**
 * Which model the agents call. Free providers are presets; any other OpenAI-compatible endpoint works
 * by giving its base URL. The calls themselves are made by the Python agents (agents/flockcast_agents);
 * this file only resolves and checks the settings. Keys only ever travel in the Authorization header.
 */

export class LlmError extends Error {
  override name = 'LlmError';
}

/** What the agents need to reach a model. The key never leaves the server and its agent processes. */
export interface LlmConfig {
  readonly provider: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly apiKey: string;
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

export interface LlmEnv {
  REHEARSAL_LLM_PROVIDER?: string;
  REHEARSAL_LLM_API_KEY?: string;
  REHEARSAL_LLM_BASE_URL?: string;
  REHEARSAL_LLM_MODEL?: string;
  /** A generic key name many apps already set; read when the REHEARSAL_ ones are unset, so one free key can serve both. */
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
}

/**
 * Reads the model settings from the environment, or null when no key is set (the engine then runs its
 * labelled offline estimate). Ollama needs no key.
 */
export function llmFromEnv(env: LlmEnv = process.env as LlmEnv): LlmConfig | null {
  const provider = (env.REHEARSAL_LLM_PROVIDER || 'groq') as ProviderName;
  if (provider !== 'custom' && !(provider in PROVIDERS)) throw new LlmError(`Unknown model provider "${provider}". Use one of ${[...Object.keys(PROVIDERS), 'custom'].join(', ')}.`);
  const preset = provider === 'custom' ? null : PROVIDERS[provider];
  const apiKey = env.REHEARSAL_LLM_API_KEY || env.LLM_API_KEY || (provider === 'ollama' ? 'ollama' : '');
  if (!apiKey) return null;
  // the shared LLM_BASE_URL applies only when no provider is named here
  const baseUrl = env.REHEARSAL_LLM_BASE_URL || (env.REHEARSAL_LLM_PROVIDER ? preset?.baseUrl : env.LLM_BASE_URL || preset?.baseUrl);
  if (!baseUrl) throw new LlmError('REHEARSAL_LLM_BASE_URL is required with the custom provider.');
  const model = env.REHEARSAL_LLM_MODEL || preset?.model;
  if (!model) throw new LlmError('REHEARSAL_LLM_MODEL is required with the custom provider.');
  return { provider, model, baseUrl: checkBaseUrl(baseUrl), apiKey };
}
