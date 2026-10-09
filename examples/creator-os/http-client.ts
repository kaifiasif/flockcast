/**
 * Option B: Creator OS calls a running Flockcast server over HTTP, with a project API key.
 *
 * Create a project in Flockcast (platform X, your handle, your audience), make an API key named
 * "Creator OS" on its API keys tab, and give Creator OS two settings:
 *
 *   FLOCKCAST_URL=https://your-flockcast.example
 *   FLOCKCAST_KEY=flk_...
 *
 * Creator OS keeps the blind-study rule itself: it only calls rehearse() after a decision.
 * The key never goes to the browser; Creator OS's server makes these calls.
 */
export interface FlockcastClientOptions {
  url: string;
  key: string;
  fetchImpl?: typeof fetch;
}

// biome-ignore lint/suspicious/noExplicitAny: responses are the Flockcast API's JSON
type Json = any;

export function flockcastClient({ url, key, fetchImpl = fetch }: FlockcastClientOptions) {
  const base = `${url.replace(/\/+$/, '')}/api/v1`;
  const call = async (method: string, path: string, body?: unknown): Promise<Json> => {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${key}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json: Json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error?.message ?? `Flockcast answered ${res.status}`);
    return json;
  };

  return {
    /** Starts (or returns the finished) rehearsal of a draft. `subject` groups reruns of one draft. */
    async rehearse(text: string, opts: { subject?: string; title?: string; platform?: string; force?: boolean } = {}) {
      return (await call('POST', '/rehearsals', { text, ...opts })).rehearsal;
    },
    async get(id: string) {
      return (await call('GET', `/rehearsals/${id}`)).rehearsal;
    },
    /** Polls until the rehearsal is done or failed. */
    async wait(id: string, { everyMs = 2000, timeoutMs = 5 * 60_000 } = {}) {
      const until = Date.now() + timeoutMs;
      for (;;) {
        const r = await this.get(id);
        if (r.status === 'done' || r.status === 'failed') return r;
        if (Date.now() > until) throw new Error('The rehearsal is still running. Check again later.');
        await new Promise((ok) => setTimeout(ok, everyMs));
      }
    },
    async ask(id: string, agentId: number, prompt: string) {
      return (await call('POST', `/rehearsals/${id}/interview`, { agent_id: agentId, prompt })).interview;
    },
  };
}

/*
 *   const flockcast = flockcastClient({ url: process.env.FLOCKCAST_URL!, key: process.env.FLOCKCAST_KEY! });
 *   const started = await flockcast.rehearse(finalText, { subject: `run:${runId}`, title: draftTitle });
 *   const done = await flockcast.wait(started.id);
 *   console.log(done.result.pushback_share, done.result.report?.markdown);
 */
