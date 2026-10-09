/**
 * Thin HTTP client for an unmodified MiroFish backend (https://github.com/666ghj/MiroFish, AGPL-3.0).
 * MiroFish runs as its own service and only its public HTTP API is called, so none of its code is in
 * this repository and its licence does not extend here. Every request sends Accept-Language: en,
 * otherwise MiroFish answers in Chinese.
 */
import { checkBaseUrl } from '../llm.ts';

export class MiroFishError extends Error {
  override name = 'MiroFishError';
  readonly status: number | undefined;
  readonly step: string;
  constructor(message: string, { status, step }: { status?: number; step: string }) {
    super(message);
    this.status = status;
    this.step = step;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Data = Record<string, any>; // MiroFish's payloads are loosely typed JSON

export interface MiroFishClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  pollMs?: number;
}

export function mirofishClient({ baseUrl, fetchImpl = globalThis.fetch, timeoutMs = 10 * 60_000, pollMs = 3000 }: MiroFishClientOptions) {
  const root = checkBaseUrl(baseUrl);

  async function call(step: string, method: string, path: string, { json, form, query }: { json?: unknown; form?: FormData; query?: Record<string, unknown> } = {}): Promise<Data> {
    const url = new URL(root + path);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { 'accept-language': 'en', accept: 'application/json' };
    let body: string | FormData | undefined;
    if (json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(json);
    }
    if (form) body = form;
    let res: Response;
    try {
      res = await fetchImpl(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      throw new MiroFishError(`Could not reach MiroFish (${(e as Error).name === 'TimeoutError' ? 'timed out' : (e as Error).message}).`, { step });
    }
    const out = (await res.json().catch(() => null)) as { success?: boolean; error?: string; data?: Data } | null;
    // MiroFish returns a Python traceback on 500s: keep it out of what people see
    if (!res.ok || !out?.success) throw new MiroFishError(String(out?.error ?? `MiroFish ${method} ${path} failed with HTTP ${res.status}.`).slice(0, 300), { status: res.status, step });
    return out.data ?? {};
  }

  async function poll(step: string, fetchState: () => Promise<Data>, { done, failed, maxWaitMs, onProgress }: { done: (d: Data) => boolean; failed: (d: Data) => boolean; maxWaitMs: number; onProgress?: (d: Data) => void }) {
    const t0 = Date.now();
    for (;;) {
      const data = await fetchState();
      onProgress?.(data);
      if (failed(data)) throw new MiroFishError(String(data.error ?? data.message ?? `${step} failed in MiroFish.`).slice(0, 300), { step });
      if (done(data)) return data;
      if (Date.now() - t0 > maxWaitMs) throw new MiroFishError(`${step} did not finish within ${Math.round(maxWaitMs / 60000)} min.`, { step });
      await sleep(pollMs);
    }
  }

  return {
    baseUrl: root,
    generateOntology({ seedMarkdown, requirement, projectName }: { seedMarkdown: string; requirement: string; projectName: string }) {
      const form = new FormData();
      form.append('files', new Blob([seedMarkdown], { type: 'text/markdown' }), 'rehearsal-seed.md');
      form.append('simulation_requirement', requirement);
      form.append('project_name', projectName);
      return call('ontology', 'POST', '/api/graph/ontology/generate', { form });
    },
    async buildGraph(projectId: string, { maxWaitMs = 20 * 60_000, onProgress }: { maxWaitMs?: number; onProgress?: (d: Data) => void } = {}) {
      const { task_id } = await call('graph', 'POST', '/api/graph/build', { json: { project_id: projectId } });
      const task = await poll('graph', () => call('graph', 'GET', `/api/graph/task/${encodeURIComponent(task_id)}`), { done: (t) => t.status === 'completed', failed: (t) => t.status === 'failed', maxWaitMs, onProgress });
      return task.result as Data;
    },
    createSimulation(projectId: string, graphId: string) {
      return call('simulation', 'POST', '/api/simulation/create', { json: { project_id: projectId, graph_id: graphId, enable_twitter: true, enable_reddit: false } });
    },
    async prepare(simulationId: string, { parallel = 2, maxWaitMs = 30 * 60_000, onProgress }: { parallel?: number; maxWaitMs?: number; onProgress?: (d: Data) => void } = {}) {
      const started = await call('prepare', 'POST', '/api/simulation/prepare', { json: { simulation_id: simulationId, use_llm_for_profiles: true, parallel_profile_count: parallel } });
      if (started.already_prepared || started.status === 'ready') return started;
      return poll('prepare', () => call('prepare', 'POST', '/api/simulation/prepare/status', { json: { task_id: started.task_id, simulation_id: simulationId } }), {
        done: (d) => d.already_prepared || d.status === 'ready' || d.status === 'completed',
        failed: (d) => d.status === 'failed',
        maxWaitMs,
        onProgress,
      });
    },
    async run(simulationId: string, { maxRounds = 10, maxWaitMs = 60 * 60_000, onProgress }: { maxRounds?: number; maxWaitMs?: number; onProgress?: (d: Data) => void } = {}) {
      await call('run', 'POST', '/api/simulation/start', { json: { simulation_id: simulationId, platform: 'twitter', max_rounds: maxRounds, enable_graph_memory_update: false } });
      return poll('run', () => call('run', 'GET', `/api/simulation/${encodeURIComponent(simulationId)}/run-status`), {
        done: (s) => ['completed', 'stopped'].includes(s.runner_status),
        failed: (s) => s.runner_status === 'failed',
        maxWaitMs,
        onProgress,
      });
    },
    posts(simulationId: string, limit = 200) {
      return call('results', 'GET', `/api/simulation/${encodeURIComponent(simulationId)}/posts`, { query: { platform: 'twitter', limit } });
    },
    actions(simulationId: string, limit = 500) {
      return call('results', 'GET', `/api/simulation/${encodeURIComponent(simulationId)}/actions`, { query: { platform: 'twitter', limit } });
    },
    async report(simulationId: string, { maxWaitMs = 30 * 60_000, onProgress }: { maxWaitMs?: number; onProgress?: (d: Data) => void } = {}) {
      const started = await call('report', 'POST', '/api/report/generate', { json: { simulation_id: simulationId } });
      if (started.status !== 'completed') {
        await poll('report', () => call('report', 'POST', '/api/report/generate/status', { json: { task_id: started.task_id, simulation_id: simulationId } }), {
          done: (d) => d.status === 'completed',
          failed: (d) => d.status === 'failed',
          maxWaitMs,
          onProgress,
        });
      }
      return call('report', 'GET', `/api/report/by-simulation/${encodeURIComponent(simulationId)}`);
    },
    /** Works only while MiroFish still has the simulation environment open. */
    interview(simulationId: string, agentId: number, prompt: string) {
      return call('interview', 'POST', '/api/simulation/interview', { json: { simulation_id: simulationId, agent_id: agentId, prompt, platform: 'twitter', timeout: 90 } });
    },
  };
}
export type MiroFishClient = ReturnType<typeof mirofishClient>;
