/** The launch advisor service with the Python crew: a full run, research only, and the service rules. Pricing and search unit tests are in agents/tests. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createAdvisor, memoryAdviceStore, pythonAgents, RehearsalError, searchSourcesFromEnv, sqliteAdviceStore, type Advice } from '../engine/index.ts';
import { readFileSync } from 'node:fs';
import { openDatabase } from '../src/db/client.ts';
import { migrate } from '../src/db/migrate.ts';
import { startModelServer } from './fake-model.ts';
import { modelAgents } from './helpers.ts';

const REQ = { product: 'Flockcast', pitch: 'Rehearse a social post with a simulated audience before you publish it.', competitors: ['Taplio'] };
let model: Awaited<ReturnType<typeof startModelServer>>;
before(async () => {
  model = await startModelServer();
});
after(() => model.close());

function harness(opts: Partial<Parameters<typeof createAdvisor>[0]> = {}) {
  const jobs: Promise<void>[] = [];
  const advisor = createAdvisor({ store: memoryAdviceStore(), agents: modelAgents(model.url), sources: ['sample'], background: (job) => void jobs.push(job()), ...opts });
  const run = async (scope: string, req: Parameters<typeof advisor.start>[1] = REQ): Promise<Advice> => {
    const started = advisor.start(scope, req);
    await Promise.all(jobs.splice(0));
    return advisor.get(scope, started.id);
  };
  return { advisor, run, settle: () => Promise.all(jobs.splice(0)) };
}

test('full run: researches, asks buyers, prices from their answers and writes a plan, in four model calls', async () => {
  const { run } = harness();
  const a = await run('p1', { ...REQ, buyers: 8 });
  assert.equal(a.status, 'done', a.error ?? '');
  const x = a.result!;
  assert.equal(x.mode, 'full');
  assert.equal(x.model_calls, 4);
  assert.ok(x.findings.length > 0 && x.findings.every((f, i) => f.id === `f${i + 1}`));
  assert.ok(x.market!.voices.length > 0, 'quotes survive when they are word for word');
  for (const v of x.market!.voices) {
    const f = x.findings.find((y) => y.id === v.finding)!;
    assert.ok(f.text.includes(v.quote), `"${v.quote}" is in ${f.id}`);
  }
  assert.equal(x.buyers.length, 8);
  assert.ok(x.reception!.score > 0 && x.reception!.score <= 100);
  // the plan's prices are arithmetic on the buyers' answers (Lord Ledger), never the model's numbers
  const hero = x.pricing!.tiers.find((t) => t.hero)!;
  assert.ok(x.pricing!.range.low <= hero.monthly! && hero.monthly! <= x.pricing!.range.high * 1.3, JSON.stringify(x.pricing));
  assert.ok(model.calls.some((c) => c.prompt.includes(`the main plan is ${hero.monthly} USD a month`)), 'Captain Compass is told the price, not asked for one');
  assert.equal(x.pricing!.tiers[0].monthly, 0, 'a free plan when the advisor calls for one');
  assert.equal(x.plan!.verdict, 'go_with_changes');
  assert.ok(x.plan!.steps.length >= 5);
});

test('the Python crew gives the same reception and prices the TypeScript advisor gave', async () => {
  // recorded from the TypeScript advisor before the agents moved to Python, against the same test model
  const golden = JSON.parse(readFileSync(new URL('./fixtures/advice-golden.json', import.meta.url), 'utf8'));
  const runs = [['subscription', 'USD', 12], ['one_time', 'INR', 7], ['subscription', 'EUR', 30]] as const;
  for (const [i, [billing, currency, buyers]] of runs.entries()) {
    const { run } = harness();
    const a = await run(`p${i}`, { product: 'Flockcast', pitch: 'Rehearse your post with a simulated audience before you publish it.', competitors: ['Taplio'], billing, currency, buyers });
    assert.equal(a.status, 'done', a.error ?? '');
    assert.deepEqual({ reception: a.result!.reception, pricing: a.result!.pricing, buyers: a.result!.buyers.length }, golden[i]);
  }
});

test('without a model the advisor still researches, and labels the result as research only', async () => {
  const { run } = harness({ agents: pythonAgents() });
  const a = await run('p1');
  assert.equal(a.status, 'done', a.error ?? '');
  assert.equal(a.result!.mode, 'offline');
  assert.equal(a.result!.model_calls, 0);
  assert.ok(a.result!.queries.includes('Flockcast'));
  assert.ok(a.result!.findings.length > 0);
  assert.equal(a.result!.plan, null);
  assert.equal(a.result!.pricing, null);
});

test('scope, input checks, the daily cap and deleting a running job', async () => {
  const { advisor, run, settle } = harness({ limits: { runsPerScopePerDay: 2 } });
  const a = await run('p1');
  assert.throws(() => advisor.get('p2', a.id), (e: RehearsalError) => e.status === 404);
  assert.throws(() => advisor.remove('p2', a.id), (e: RehearsalError) => e.status === 404);
  assert.equal(advisor.list('p2').length, 0);
  assert.throws(() => advisor.start('p1', { product: '', pitch: REQ.pitch }), (e: RehearsalError) => e.code === 'INVALID');
  assert.throws(() => advisor.start('p1', { ...REQ, pitch: 'too short' }), (e: RehearsalError) => e.code === 'INVALID');
  assert.throws(() => advisor.start('p1', { ...REQ, buyers: 500 }), (e: RehearsalError) => e.code === 'INVALID');
  const running = advisor.start('p1', REQ);
  assert.throws(() => advisor.remove('p1', running.id), (e: RehearsalError) => e.code === 'NOT_READY');
  await settle();
  assert.throws(() => advisor.start('p1', REQ), (e: RehearsalError) => e.code === 'RATE_LIMITED');
  advisor.remove('p1', a.id);
  assert.equal(advisor.list('p1').length, 1);
});

test('sqlite store keeps runs per scope and fails the ones a restart cut off', () => {
  const db = openDatabase(':memory:');
  migrate(db);
  db.run("INSERT INTO users (id, email, password_hash, created_at) VALUES ('u1', 'a@example.com', 'x', '2026-01-01')");
  for (const id of ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']) {
    db.run("INSERT INTO projects (id, user_id, name, platform, handle, personas, rounds, created_at, updated_at) VALUES (?, 'u1', 'P', 'x', '@p', 6, 3, '2026-01-01', '2026-01-01')", id);
  }
  const store = sqliteAdviceStore(db);
  const [p1, p2] = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
  const row: Advice = { id: 'a1', scope: p1, title: 'X', status: 'researching', progress: 10, input: { ...REQ, audience: null, price_idea: null, billing: 'subscription', currency: 'USD', buyers: 12 }, result: null, error: null, created_at: new Date().toISOString(), finished_at: null };
  store.insert(row);
  assert.equal(store.get(p2, 'a1'), undefined);
  assert.equal(store.list(p1).length, 1);
  assert.equal(store.failStale(new Date().toISOString()), 1);
  assert.equal(store.get(p1, 'a1')!.status, 'failed');
  assert.equal(store.remove(p2, 'a1'), false);
  // deleting the project deletes its advice
  db.run('DELETE FROM projects WHERE id = ?', p1);
  assert.equal(store.list(p1).length, 0);
});

test('advisor sources come from settings and are checked before anything runs', () => {
  assert.deepEqual(searchSourcesFromEnv({}), ['hackernews', 'reddit']);
  assert.deepEqual(searchSourcesFromEnv({ TAVILY_API_KEY: 'k' }), ['hackernews', 'reddit', 'web']);
  assert.deepEqual(searchSourcesFromEnv({ ADVISOR_SOURCES: 'sample, sample' }), ['sample']);
  assert.throws(() => searchSourcesFromEnv({ ADVISOR_SOURCES: 'web' }), /TAVILY_API_KEY/);
  assert.throws(() => searchSourcesFromEnv({ ADVISOR_SOURCES: 'twitter' }), /Unknown advisor source/);
});

test('a crew that cannot answer fails the run with a plain message', async () => {
  const { run } = harness({ agents: pythonAgents({ python: 'definitely-not-python' }) });
  const a = await run('p1');
  assert.equal(a.status, 'failed');
  assert.match(a.error!, /Could not start the Python agents/);
});
