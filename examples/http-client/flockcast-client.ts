/**
 * A typed client for any app that talks to a Flockcast server over HTTP: a writing tool, a CMS, a
 * Slack bot, a CI job. Copy this file; it has no dependencies beyond fetch.
 *
 * Make a project in Flockcast, create an API key on its API keys tab, and give your app two settings:
 *
 *   FLOCKCAST_URL=https://your-flockcast.example
 *   FLOCKCAST_KEY=flk_...
 *
 * Call it from your server only: the key must never reach a browser. A key works for its one project.
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
    /** The project this key belongs to. */
    async project() {
      return (await call('GET', '/project')).project;
    },
    /** Starts a launch advisor run for a product: research, simulated buyers, prices and a plan. */
    async advise(input: { product: string; pitch: string; audience?: string; price_idea?: string; competitors?: string[]; billing?: 'subscription' | 'one_time'; currency?: 'USD' | 'EUR' | 'GBP' | 'INR'; buyers?: number }) {
      return (await call('POST', '/advice', input)).advice;
    },
    async getAdvice(id: string) {
      return (await call('GET', `/advice/${id}`)).advice;
    },
    /** Polls until the advice is done or failed. */
    async waitAdvice(id: string, { everyMs = 3000, timeoutMs = 10 * 60_000 } = {}) {
      const until = Date.now() + timeoutMs;
      for (;;) {
        const a = await this.getAdvice(id);
        if (a.status === 'done' || a.status === 'failed') return a;
        if (Date.now() > until) throw new Error('The advice is still being worked on. Check again later.');
        await new Promise((ok) => setTimeout(ok, everyMs));
      }
    },
  };
}

/*
 *   const flockcast = flockcastClient({ url: process.env.FLOCKCAST_URL!, key: process.env.FLOCKCAST_KEY! });
 *   const started = await flockcast.rehearse(draftText, { subject: `draft:${draftId}`, title: draftTitle });
 *   const done = await flockcast.wait(started.id);
 *   console.log(done.result.pushback_share, done.result.report?.markdown);
 *
 *   const advice = await flockcast.waitAdvice((await flockcast.advise({ product: 'Acme', pitch: 'What it does, in a sentence or two.' })).id);
 *   console.log(advice.result.plan?.headline, advice.result.pricing?.tiers);
 */
