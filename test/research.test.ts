/** Studies (focus groups, message tests, crisis rehearsals) and brand rules, through the app API. Agent unit tests are in agents/tests/test_research.py. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { swarmEngine } from '../engine/index.ts';
import { startModelServer } from './fake-model.ts';
import { createHarness, modelAgents, type Client, type Harness, type Json } from './helpers.ts';

const SEGMENTS = [{ name: 'Founders', about: 'Run seed-stage startups' }, { name: 'Comms leads', about: 'Sign off on brand posts' }];
const FOCUS = { kind: 'focus_group', topic: 'Launch post', material: 'We cut onboarding time by 80%. Sign up today.', questions: ['First reaction?', 'Would you share it?'], segments: SEGMENTS, panelists: 4 };
const MESSAGES = { kind: 'message_test', goal: 'Get sign-ups', messages: [{ label: 'Hype', text: 'The best tool ever made. 9 in 10 agree.' }, { label: 'Plain', text: 'Try your next post on a simulated crowd before you publish.' }], segments: SEGMENTS, per_segment: 3 };
const CRISIS = { kind: 'crisis', situation: 'Payments failed for 6 hours on Monday.', statement: 'Unfortunately an issue occurred with a third-party provider. We take security seriously.', stakeholders: ['customers', 'press'] };

let model: Awaited<ReturnType<typeof startModelServer>>;
before(async () => {
  model = await startModelServer();
});
after(() => model.close());

async function run(h: Harness, me: Client, pid: string, body: unknown): Promise<Json> {
  const r = await me.api('POST', `/api/projects/${pid}/studies`, body);
  assert.equal(r.status, 202, JSON.stringify(r.body));
  await h.settle();
  const got = (await me.api('GET', `/api/projects/${pid}/studies/${r.body.study.id}`)).body.study;
  assert.equal(got.status, 'done', got.error);
  return got;
}

test('offline: every kind of study runs free and says it is an estimate', async () => {
  const h = createHarness();
  const me = await h.owner();
  const p = await h.project(me);
  const focus = await run(h, me, p.id, FOCUS);
  assert.equal(focus.result.engine, 'swarm-offline');
  assert.equal(focus.result.panel.length, 4);
  assert.equal(focus.result.transcript.length, 2);
  assert.equal(focus.result.summary.themes[0].title, 'Claims need backing');

  assert.equal((await me.api('PUT', `/api/projects/${p.id}/brand`, { banned: ['best'], required: ['#flockcast'] })).status, 200);
  const test1 = await run(h, me, p.id, MESSAGES);
  assert.equal(test1.result.winner, 1, 'the plain, clear version wins offline');
  assert.equal(test1.result.matrix.length, 2);
  assert.deepEqual(test1.result.messages[0].brand.map((b: Json) => b.level), ['risk', 'warn']);

  const crisis = await run(h, me, p.id, CRISIS);
  assert.ok(crisis.result.checks.some((c: Json) => c.id === 'deflect' && c.level === 'risk'));
  assert.equal(crisis.result.advice.revised, null, 'no rewrite without a model');

  const list = (await me.api('GET', `/api/projects/${p.id}/studies?kind=crisis`)).body.studies;
  assert.deepEqual(list.map((s: Json) => s.kind), ['crisis']);
  assert.equal(list[0].result, null, 'lists leave out results');
  assert.equal((await me.api('DELETE', `/api/projects/${p.id}/studies/${crisis.id}`)).status, 200);
  const audit = (await me.api('GET', `/api/projects/${p.id}/audit`)).body.events.map((e: Json) => e.action);
  assert.ok(audit.includes('study.started') && audit.includes('brand.updated') && audit.includes('study.deleted'));
});

test('with a model: panels discuss, ratings split by group, and a revised statement cannot invent numbers', async () => {
  const h = createHarness({ engine: swarmEngine({ agents: modelAgents(model.url) }), agents: modelAgents(model.url) });
  const me = await h.owner();
  const p = await h.project(me);
  const focus = await run(h, me, p.id, FOCUS);
  assert.equal(focus.result.engine, 'swarm');
  assert.equal(focus.result.model_calls, 4, 'panel, two questions, write-up');
  assert.equal(focus.result.summary.themes[0].title, 'Proof before sharing');
  assert.equal(focus.result.sentiment.overall.positive, 0.5);

  const msg = await run(h, me, p.id, MESSAGES);
  assert.equal(msg.result.winner, 1);
  assert.equal(msg.result.split, false);
  assert.equal(msg.result.matrix[0].cells[1].act_share, 1);

  const crisis = await run(h, me, p.id, CRISIS);
  assert.equal(crisis.result.reactions[0].worst_line, 'Unfortunately an issue occurred with a third-party provider');
  assert.equal(crisis.result.spread.spread, 'medium');
  // "6 hours" was in the situation; "2,000 orders" was not
  assert.match(crisis.result.advice.revised, /6 hours/);
  assert.match(crisis.result.advice.revised, /\[fact\] orders/);
});

test('brand rules are checked on every rehearsal', async () => {
  const h = createHarness({ engine: swarmEngine({ agents: modelAgents(model.url) }), agents: modelAgents(model.url) });
  const me = await h.owner();
  const p = await h.project(me);
  const brand = (await me.api('PUT', `/api/projects/${p.id}/brand`, { voice: 'Calm, plain and warm', banned: ['game-changer', ' '], required: [] })).body.brand;
  assert.deepEqual(brand.banned, ['game-changer']);
  assert.deepEqual((await me.api('GET', `/api/projects/${p.id}`)).body.project.brand.voice, 'Calm, plain and warm');
  const r = await me.api('POST', `/api/projects/${p.id}/rehearsals`, { text: 'This is a game-changer for every founder. Try it today.', rounds: 1, personas: 4 });
  await h.settle();
  const result = (await me.api('GET', `/api/projects/${p.id}/rehearsals/${r.body.rehearsal.id}`)).body.rehearsal.result;
  assert.equal(result.brand.ok, false);
  assert.deepEqual(result.brand.issues.map((i: Json) => i.level), ['risk', 'warn']);
  assert.equal(result.brand.voice.fits, false);
  // clearing the rules
  assert.equal((await me.api('PUT', `/api/projects/${p.id}/brand`, {})).body.brand, null);
});

test('plans and roles: studies are Enterprise, brand rules are Studio, and only editors start studies', async () => {
  const h = createHarness({ env: { FLOCKCAST_PLANS: 'on', REHEARSAL_SIGNUP: 'open' } });
  const me = await h.owner();
  const p = await h.project(me);
  h.ctx.accounts.setPlan('owner@example.com', 'creator');
  const refused = await me.api('PUT', `/api/projects/${p.id}/brand`, { banned: ['x'] });
  assert.equal(refused.body.error.code, 'PLAN_REQUIRED');
  h.ctx.accounts.setPlan('owner@example.com', 'studio');
  assert.equal((await me.api('PUT', `/api/projects/${p.id}/brand`, { banned: ['x'] })).status, 200);
  const study = await me.api('POST', `/api/projects/${p.id}/studies`, CRISIS);
  assert.equal(study.status, 403);
  assert.match(study.body.error.message, /Enterprise plan/);
  h.ctx.accounts.setPlan('owner@example.com', 'enterprise');

  const inv = await me.api('POST', `/api/projects/${p.id}/invites`, { role: 'viewer' });
  const viewer = await h.signUp('viewer@example.com');
  await viewer.api('POST', '/api/invites/accept', { token: inv.body.token });
  assert.equal((await viewer.api('POST', `/api/projects/${p.id}/studies`, CRISIS)).status, 403);
  assert.equal((await viewer.api('PUT', `/api/projects/${p.id}/brand`, {})).status, 403);
  assert.equal((await viewer.api('GET', `/api/projects/${p.id}/studies`)).status, 200);

  const bad = await me.api('POST', `/api/projects/${p.id}/studies`, { ...MESSAGES, messages: [MESSAGES.messages[0]] });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'VALIDATION_FAILED');
  await h.settle();
});

test('the API runs studies for the key\'s project only', async () => {
  const h = createHarness();
  const me = await h.owner();
  const p = await h.project(me);
  const other = await h.project(me, { name: 'Other' });
  const bearer = { authorization: `Bearer ${(await me.api('POST', `/api/projects/${p.id}/keys`, { name: 'CI' })).body.secret}` };
  const started = await h.anon('POST', '/api/v1/studies', CRISIS, bearer);
  assert.equal(started.status, 202, JSON.stringify(started.body));
  const theirs = await me.api('POST', `/api/projects/${other.id}/studies`, CRISIS);
  await h.settle();
  assert.equal((await h.anon('GET', `/api/v1/studies/${started.body.study.id}`, undefined, bearer)).body.study.status, 'done');
  assert.equal((await h.anon('GET', `/api/v1/studies/${theirs.body.study.id}`, undefined, bearer)).status, 404);
  assert.equal((await h.anon('GET', '/api/v1/studies', undefined, bearer)).body.studies.length, 1);
  const actors = (await me.api('GET', `/api/projects/${p.id}/audit`)).body.events.filter((e: Json) => e.action === 'study.started').map((e: Json) => e.actor);
  assert.match(actors[0], /^api key /);
});
