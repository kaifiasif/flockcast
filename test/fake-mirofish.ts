// In-process stand-in for the MiroFish backend: same paths, same {success, data} envelope, same
// status values, canned simulation output. Lets the integration be tested without keys or Python.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

// biome-ignore lint/suspicious/noExplicitAny: canned JSON
type Any = any;

export function startFakeMiroFish({ seedDraft = true, failAt = null as string | null, reportFails = false } = {}): Promise<{ url: string; state: Any; close: () => Promise<void> }> {
  const state: Any = { requests: [], requirement: null, draft: null, polls: {} };
  const ok = (res: ServerResponse, data: unknown) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ success: true, data })); };
  const fail = (res: ServerResponse, code: number, error: string) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify({ success: false, error, traceback: 'Traceback (most recent call last): ...' })); };
  // Each async task reports "processing" once before completing, to exercise polling.
  const tick = (key: string) => (state.polls[key] = (state.polls[key] || 0) + 1) > 1;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    const url = new URL(req.url ?? '/', 'http://x');
    const p = url.pathname;
    state.requests.push({ method: req.method, path: p, lang: req.headers['accept-language'] });
    const json: Any = (req.headers['content-type'] || '').includes('json') && raw ? JSON.parse(raw) : {};
    if (failAt && p.includes(failAt)) return fail(res, 500, `fake failure at ${failAt}`);

    if (p === '/api/graph/ontology/generate') {
      const m = raw.match(/name="simulation_requirement"\r\n\r\n([\s\S]*?)\r\n--/);
      state.requirement = m?.[1] ?? null;
      state.draft = state.requirement?.match(/"""([\s\S]*?)"""/)?.[1] ?? '';
      state.seedFile = raw.match(/filename="rehearsal-seed\.md"/) ? raw : null;
      return ok(res, { project_id: 'proj_1', ontology: { entity_types: ['Creator', 'Skeptic'] } });
    }
    if (p === '/api/graph/build') return ok(res, { project_id: json.project_id, task_id: 'task_graph' });
    if (p === '/api/graph/task/task_graph') {
      return tick('graph') ? ok(res, { status: 'completed', progress: 100, result: { graph_id: 'mirofish_g1', node_count: 12 } }) : ok(res, { status: 'processing', progress: 40 });
    }
    if (p === '/api/simulation/create') return ok(res, { simulation_id: 'sim_1', status: 'created' });
    if (p === '/api/simulation/prepare') return ok(res, { simulation_id: json.simulation_id, task_id: 'task_prep', status: 'preparing', already_prepared: false });
    if (p === '/api/simulation/prepare/status') {
      return tick('prep') ? ok(res, { status: 'ready', already_prepared: true, progress: 100 }) : ok(res, { status: 'processing', progress: 50 });
    }
    if (p === '/api/simulation/start') { state.start = json; return ok(res, { simulation_id: json.simulation_id, runner_status: 'running' }); }
    if (p === '/api/simulation/sim_1/run-status') {
      return tick('run') ? ok(res, { runner_status: 'completed', current_round: json.max_rounds ?? 10, progress_percent: 100 }) : ok(res, { runner_status: 'running', current_round: 3, progress_percent: 30 });
    }
    if (p === '/api/simulation/sim_1/posts') {
      const posts = [
        { post_id: 1, user_id: 0, original_post_id: null, content: seedDraft ? state.draft : 'Something unrelated about weekend plans and coffee.', num_likes: 4, num_shares: 1, num_dislikes: 0 },
        { post_id: 2, user_id: 3, original_post_id: 1, content: '', quote_content: 'Where is the source for the forty percent figure?', num_likes: 2 },
        { post_id: 3, user_id: 5, original_post_id: null, content: 'Fluent sentences fooling reviewers is real, I see it in every code review.', num_likes: 1 },
      ];
      return ok(res, { platform: 'twitter', total: posts.length, count: posts.length, posts });
    }
    if (p === '/api/simulation/sim_1/actions') {
      const actions = [
        { round_num: 1, agent_id: 0, agent_name: 'Creator', action_type: 'CREATE_POST', action_args: { content: state.draft } },
        { round_num: 2, agent_id: 3, agent_name: 'Skeptical Sam', action_type: 'QUOTE_POST', action_args: { post_id: 1, quote_content: 'Where is the source for the forty percent figure?' } },
        { round_num: 2, agent_id: 4, agent_name: 'Peer Pat', action_type: 'LIKE_POST', action_args: { post_id: 1 } },
        { round_num: 3, agent_id: 6, agent_name: 'Lurker Lee', action_type: 'REPOST', action_args: { post_id: 1 } },
        { round_num: 3, agent_id: 5, agent_name: 'Dev Dana', action_type: 'CREATE_POST', action_args: { content: 'Fluent sentences fooling reviewers is real, I see it in every code review.' } },
      ];
      return ok(res, { count: actions.length, actions });
    }
    if (p === '/api/report/generate') return reportFails ? fail(res, 500, 'report LLM quota exceeded') : ok(res, { simulation_id: json.simulation_id, task_id: 'task_rep', status: 'generating' });
    if (p === '/api/report/generate/status') return tick('rep') ? ok(res, { status: 'completed', progress: 100 }) : ok(res, { status: 'processing', progress: 60 });
    if (p === '/api/report/by-simulation/sim_1') return ok(res, { report_id: 'report_1', status: 'completed', markdown_content: '# Prediction\nSkeptics will ask for the source of the number.' });
    if (p === '/api/simulation/interview') {
      if (json.simulation_id !== 'sim_1') return fail(res, 400, 'env not running');
      return ok(res, { agent_id: json.agent_id, prompt: json.prompt, result: { agent_id: json.agent_id, response: 'I would want a link before reposting.', platform: 'twitter' } });
    }
    return fail(res, 404, `fake: no route ${req.method} ${p}`);
  });

  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const { port } = server.address() as AddressInfo;
    resolve({ url: `http://127.0.0.1:${port}`, state, close: () => new Promise<void>((r) => server.close(() => r())) });
  }));
}
