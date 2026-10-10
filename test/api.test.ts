/** The HTTP app end to end: accounts, projects, rehearsals, API keys, and the security baseline. */
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { currentStep, totpCode } from '../src/modules/auth/totp.ts';
import { startModelServer } from './fake-model.ts';
import { createHarness, modelAgents, TEST_PASSWORD } from './helpers.ts';

const POST = 'Fluent sentences are the dangerous ones. Reviewers skim them and forty percent of errors hide there.';
const ADVICE = { product: 'Flockcast', pitch: 'Rehearse a social post with a simulated audience before you publish it.', competitors: ['Taplio'] };

test('closed sign-up: the first account gets in, later strangers do not', async () => {
  const h = createHarness();
  const before = await h.anon('GET', '/api/auth/session');
  assert.deepEqual(before.body, { user: null, signup_open: true, first_account: true });
  await h.owner();
  const after = await h.anon('GET', '/api/auth/session');
  assert.equal(after.body.signup_open, false);
  const stranger = await h.anon('POST', '/api/auth/signup', { email: 'x@example.com', password: TEST_PASSWORD });
  assert.equal(stranger.status, 403);
});

test('owner email: only that address may create the first account', async () => {
  const h = createHarness({ env: { REHEARSAL_OWNER_EMAIL: 'me@example.com' } });
  assert.equal((await h.anon('POST', '/api/auth/signup', { email: 'squatter@example.com', password: TEST_PASSWORD })).status, 403);
  await h.signUp('me@example.com');
});

test('sign in, wrong password, log out, and 2-step codes', async () => {
  const h = createHarness();
  const me = await h.owner();
  assert.equal((await h.anon('POST', '/api/auth/login', { email: me.user.email, password: 'wrong password!!' })).status, 401);
  const ok = await h.anon('POST', '/api/auth/login', { email: me.user.email, password: TEST_PASSWORD });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('set-cookie')!, /HttpOnly/i);
  assert.match(ok.headers.get('set-cookie')!, /SameSite=Lax/i);

  const setup = await me.api('POST', '/api/auth/mfa/setup');
  assert.match(setup.body.otpauth_uri, /^otpauth:\/\/totp\//);
  const code = totpCode(setup.body.secret, currentStep());
  assert.equal((await me.api('POST', '/api/auth/mfa/enable', { code })).status, 200);
  const noCode = await h.anon('POST', '/api/auth/login', { email: me.user.email, password: TEST_PASSWORD });
  assert.equal(noCode.status, 401);
  assert.equal(noCode.body.error.code, 'MFA_REQUIRED');
  const withCode = await h.anon('POST', '/api/auth/login', { email: me.user.email, password: TEST_PASSWORD, code: totpCode(setup.body.secret, currentStep() + 1) });
  assert.equal(withCode.status, 200);

  assert.equal((await me.api('POST', '/api/auth/logout')).status, 200);
  assert.equal((await me.api('GET', '/api/projects')).status, 401, 'the old cookie stops working');
});

test('projects: create, list, edit, validate, delete', async () => {
  const h = createHarness();
  const me = await h.owner();
  const p = await h.project(me, { platform: 'linkedin', audience: 'Founders: early-stage', examples: [{ text: 'An older post.' }] });
  assert.equal(p.platform, 'linkedin');
  assert.equal(p.examples.length, 1);
  const list = await me.api('GET', '/api/projects');
  assert.equal(list.body.projects.length, 1);
  assert.equal(list.body.projects[0].rehearsal_count, 0);
  const edited = await me.api('PUT', `/api/projects/${p.id}`, { name: 'Renamed', handle: '@k', platform: 'bluesky' });
  assert.equal(edited.body.project.name, 'Renamed');
  assert.equal(edited.body.project.platform, 'bluesky');
  const bad = await me.api('POST', '/api/projects', { name: '', handle: '@k', platform: 'myspace' });
  assert.equal(bad.status, 400);
  assert.equal((await me.api('DELETE', `/api/projects/${p.id}`)).status, 200);
  assert.equal((await me.api('GET', `/api/projects/${p.id}`)).status, 404);
});

test('rehearsal flow in the app: start, poll, list, results, delete', async () => {
  const h = createHarness();
  const me = await h.owner();
  const p = await h.project(me);
  const started = await me.api('POST', `/api/projects/${p.id}/rehearsals`, { text: POST, title: 'Fluent sentences' });
  assert.equal(started.status, 202, JSON.stringify(started.body));
  await h.settle();
  const r = await me.api('GET', `/api/projects/${p.id}/rehearsals/${started.body.rehearsal.id}`);
  assert.equal(r.body.rehearsal.status, 'done');
  assert.equal(r.body.rehearsal.title, 'Fluent sentences');
  assert.equal(r.body.rehearsal.settings.personas, 6, 'project defaults apply');
  assert.equal(r.body.rehearsal.result.engine, 'swarm-offline');
  assert.ok(!('state' in r.body.rehearsal), 'engine memory never leaves the server');

  const list = await me.api('GET', `/api/projects/${p.id}/rehearsals`);
  assert.equal(list.body.rehearsals.length, 1);
  assert.equal((await me.api('GET', '/api/projects')).body.projects[0].rehearsal_count, 1);

  const ask = await me.api('POST', `/api/projects/${p.id}/rehearsals/${r.body.rehearsal.id}/interview`, { agent_id: 1, prompt: 'Why?' });
  assert.equal(ask.status, 409, 'offline followers cannot be asked');

  assert.equal((await me.api('DELETE', `/api/projects/${p.id}/rehearsals/${r.body.rehearsal.id}`)).status, 200);
  assert.equal((await me.api('GET', `/api/projects/${p.id}/rehearsals`)).body.rehearsals.length, 0);
});

test('object-level access: another user sees 404 for every project, rehearsal and key', async () => {
  const h = createHarness({ env: { REHEARSAL_SIGNUP: 'open' } });
  const me = await h.owner();
  const them = await h.signUp('them@example.com');
  const p = await h.project(me);
  const r = await me.api('POST', `/api/projects/${p.id}/rehearsals`, { text: POST });
  await h.settle();
  const k = await me.api('POST', `/api/projects/${p.id}/keys`, { name: 'My app' });
  const rid = r.body.rehearsal.id;
  const adv = await me.api('POST', `/api/projects/${p.id}/advice`, ADVICE);
  assert.equal(adv.status, 202, JSON.stringify(adv.body));
  await h.settle();
  const aid = adv.body.advice.id;
  const cmp = await me.api('POST', `/api/projects/${p.id}/comparisons`, { drafts: [{ text: POST }, { text: `${POST} Take two.` }], personas: 4, rounds: 2 });
  assert.equal(cmp.status, 202, JSON.stringify(cmp.body));
  await h.settle();
  const gid = cmp.body.group_id;
  for (const [method, path, body] of [
    ['GET', `/api/projects/${p.id}`],
    ['PUT', `/api/projects/${p.id}`, { name: 'x', handle: 'x' }],
    ['DELETE', `/api/projects/${p.id}`],
    ['GET', `/api/projects/${p.id}/rehearsals`],
    ['POST', `/api/projects/${p.id}/rehearsals`, { text: POST }],
    ['GET', `/api/projects/${p.id}/rehearsals/${rid}`],
    ['DELETE', `/api/projects/${p.id}/rehearsals/${rid}`],
    ['POST', `/api/projects/${p.id}/rehearsals/${rid}/interview`, { agent_id: 1, prompt: 'hi' }],
    ['GET', `/api/projects/${p.id}/keys`],
    ['POST', `/api/projects/${p.id}/keys`, { name: 'x' }],
    ['DELETE', `/api/projects/${p.id}/keys/${k.body.key.id}`],
    ['GET', `/api/projects/${p.id}/advice`],
    ['POST', `/api/projects/${p.id}/advice`, ADVICE],
    ['GET', `/api/projects/${p.id}/advice/${aid}`],
    ['DELETE', `/api/projects/${p.id}/advice/${aid}`],
    ['POST', `/api/projects/${p.id}/comparisons`, { drafts: [{ text: 'a' }, { text: 'b' }] }],
    ['GET', `/api/projects/${p.id}/comparisons/${gid}`],
    ['PUT', `/api/projects/${p.id}/rehearsals/${rid}/outcome`, { likes: 1, reposts: 0, replies: 0 }],
    ['DELETE', `/api/projects/${p.id}/rehearsals/${rid}/outcome`],
    ['GET', `/api/projects/${p.id}/calibration`],
  ] as const) {
    const res = await them.api(method, path, body);
    assert.equal(res.status, 404, `${method} ${path} gave ${res.status}`);
  }
  assert.equal((await them.api('GET', '/api/projects')).body.projects.length, 0);
  // and a rehearsal id under the wrong project of the right user is also not found
  const p2 = await h.project(me, { name: 'Other' });
  assert.equal((await me.api('GET', `/api/projects/${p2.id}/rehearsals/${rid}`)).status, 404);
  assert.equal((await me.api('GET', `/api/projects/${p2.id}/advice/${aid}`)).status, 404);
  assert.equal((await me.api('GET', `/api/projects/${p2.id}/comparisons/${gid}`)).status, 404);
  assert.equal((await me.api('PUT', `/api/projects/${p2.id}/rehearsals/${rid}/outcome`, { likes: 1, reposts: 0, replies: 0 })).status, 404);
});

test('compare drafts on one crowd, record real results, and see how close rehearsals came', async () => {
  const h = createHarness();
  const me = await h.owner();
  const p = await h.project(me);
  const bad = await me.api('POST', `/api/projects/${p.id}/comparisons`, { drafts: [{ text: POST }] });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'VALIDATION_FAILED');
  const same = await me.api('POST', `/api/projects/${p.id}/comparisons`, { drafts: [{ text: POST }, { text: POST }] });
  assert.equal(same.status, 400);

  const cmp = await me.api('POST', `/api/projects/${p.id}/comparisons`, { drafts: [{ text: POST, title: 'Plain' }, { text: `${POST} I tried it on 30 drafts.` }, { text: 'Read your drafts backwards. That is the whole tip.' }], personas: 6, rounds: 2 });
  assert.equal(cmp.status, 202);
  assert.deepEqual(cmp.body.rehearsals.map((r: { variant: string }) => r.variant), ['A', 'B', 'C']);
  await h.settle();
  const group = await me.api('GET', `/api/projects/${p.id}/comparisons/${cmp.body.group_id}`);
  const [a, b, c] = group.body.rehearsals;
  assert.ok([a, b, c].every((r) => r.status === 'done'), JSON.stringify(group.body.rehearsals.map((r: { error: string }) => r.error)));
  const names = (r: { result: { personas: { name: string }[] } }) => r.result.personas.map((x) => x.name).join();
  assert.equal(names(b), names(a), 'B is read by the same people as A');
  assert.equal(names(c), names(a));
  const listed = await me.api('GET', `/api/projects/${p.id}/rehearsals?group=${cmp.body.group_id}`);
  assert.equal(listed.body.rehearsals.length, 3);

  const out = await me.api('PUT', `/api/projects/${p.id}/rehearsals/${a.id}/outcome`, { likes: 40, reposts: 5, replies: 8, impressions: 2000, note: 'Posted Tuesday 9am' });
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal(out.body.rehearsal.outcome.likes, 40);
  assert.equal(out.body.rehearsal.outcome.quotes, 0);
  await me.api('PUT', `/api/projects/${p.id}/rehearsals/${b.id}/outcome`, { likes: 10, reposts: 1, replies: 2 });
  const neg = await me.api('PUT', `/api/projects/${p.id}/rehearsals/${c.id}/outcome`, { likes: -1, reposts: 0, replies: 0 });
  assert.equal(neg.status, 400);

  const cal = (await me.api('GET', `/api/projects/${p.id}/calibration`)).body.calibration;
  assert.equal(cal.count, 2);
  assert.ok(cal.average_match === null || (cal.average_match >= 0 && cal.average_match <= 1));
  assert.equal(cal.comparisons.length, 1);
  assert.equal(cal.comparisons[0].best, 'A');

  assert.equal((await me.api('DELETE', `/api/projects/${p.id}/rehearsals/${a.id}/outcome`)).status, 200);
  assert.equal((await me.api('GET', `/api/projects/${p.id}/calibration`)).body.calibration.count, 1);

  // the same through a project key
  const k = await me.api('POST', `/api/projects/${p.id}/keys`, { name: 'CI' });
  const bearer = { authorization: `Bearer ${k.body.secret}` };
  const v1 = await h.anon('POST', '/api/v1/comparisons', { drafts: [{ text: 'Hook one about drafts.' }, { text: 'Hook two about drafts.' }], personas: 4, rounds: 1 }, bearer);
  assert.equal(v1.status, 202, JSON.stringify(v1.body));
  await h.settle();
  assert.equal((await h.anon('GET', `/api/v1/comparisons/${v1.body.group_id}`, undefined, bearer)).body.rehearsals.length, 2);
  assert.equal((await h.anon('GET', `/api/v1/comparisons/${cmp.body.group_id}`, undefined, bearer)).body.rehearsals.length, 3);
  assert.equal((await h.anon('PUT', `/api/v1/rehearsals/${b.id}/outcome`, { likes: 3, reposts: 0, replies: 1 }, bearer)).status, 200);
  assert.equal((await h.anon('GET', '/api/v1/calibration', undefined, bearer)).body.calibration.count, 1);
});

test('API keys: shown once, hashed, one project only, revocable', async () => {
  const h = createHarness();
  const me = await h.owner();
  const p = await h.project(me);
  const other = await h.project(me, { name: 'Other' });
  const made = await me.api('POST', `/api/projects/${p.id}/keys`, { name: 'My app' });
  assert.equal(made.status, 201);
  const secret: string = made.body.secret;
  assert.match(secret, /^flk_[\w-]{43}$/);
  const listed = await me.api('GET', `/api/projects/${p.id}/keys`);
  assert.equal(listed.body.keys.length, 1);
  assert.ok(!JSON.stringify(listed.body).includes(secret), 'the full key is never shown again');
  assert.equal(listed.body.keys[0].prefix, secret.slice(0, 10));
  const row = h.ctx.db.get<{ hash: string }>('SELECT hash FROM api_keys');
  assert.notEqual(row?.hash, secret);

  const bearer = { authorization: `Bearer ${secret}` };
  const who = await h.anon('GET', '/api/v1/project', undefined, bearer);
  assert.equal(who.body.project.id, p.id);
  const started = await h.anon('POST', '/api/v1/rehearsals', { text: POST, subject: 'draft-1' }, bearer);
  assert.equal(started.status, 202, JSON.stringify(started.body));
  await h.settle();
  const got = await h.anon('GET', `/api/v1/rehearsals/${started.body.rehearsal.id}`, undefined, bearer);
  assert.equal(got.body.rehearsal.status, 'done');
  assert.equal((await h.anon('GET', '/api/v1/rehearsals?subject=draft-1', undefined, bearer)).body.rehearsals.length, 1);

  // the key cannot reach another project's rehearsals
  const theirs = await me.api('POST', `/api/projects/${other.id}/rehearsals`, { text: POST });
  await h.settle();
  assert.equal((await h.anon('GET', `/api/v1/rehearsals/${theirs.body.rehearsal.id}`, undefined, bearer)).status, 404);
  // keys never work as cookies, and the cookie API ignores them
  assert.equal((await h.anon('GET', '/api/projects', undefined, bearer)).status, 401);
  assert.equal((await h.anon('GET', '/api/v1/project', undefined, { authorization: 'Bearer flk_not-a-real-key' })).status, 401);
  assert.equal((await h.anon('GET', '/api/v1/project')).status, 401);

  assert.equal((await me.api('DELETE', `/api/projects/${p.id}/keys/${made.body.key.id}`)).status, 200);
  assert.equal((await h.anon('GET', '/api/v1/project', undefined, bearer)).status, 401);
  // deleting a project kills its keys too
  const k2 = await me.api('POST', `/api/projects/${other.id}/keys`, { name: 'CI' });
  await me.api('DELETE', `/api/projects/${other.id}`);
  assert.equal((await h.anon('GET', '/api/v1/project', undefined, { authorization: `Bearer ${k2.body.secret}` })).status, 401);
});

test('cross-site requests are refused for cookie sessions', async () => {
  const h = createHarness();
  const me = await h.owner();
  const res = await me.api('POST', '/api/projects', { name: 'x', handle: 'x' }, { origin: 'https://evil.example' });
  assert.equal(res.status, 403);
  const site = await me.api('POST', '/api/projects', { name: 'x', handle: 'x' }, { 'sec-fetch-site': 'cross-site' });
  assert.equal(site.status, 403);
});

test('rate limits: model spend per user, and failed log-ins', async () => {
  const h = createHarness({ config: { rateLimits: { api: { limit: 1000, windowMs: 60_000 }, costly: { limit: 2, windowMs: 60_000 }, authFailures: { limit: 3, windowMs: 60_000 }, signups: { limit: 100, windowMs: 60_000 } } } });
  const me = await h.owner();
  const p = await h.project(me);
  for (let i = 0; i < 2; i++) assert.equal((await me.api('POST', `/api/projects/${p.id}/rehearsals`, { text: `${POST} ${i}` })).status, 202);
  const third = await me.api('POST', `/api/projects/${p.id}/rehearsals`, { text: `${POST} 3` });
  assert.equal(third.status, 429);
  assert.ok(third.headers.get('retry-after'));
  for (let i = 0; i < 3; i++) await h.anon('POST', '/api/auth/login', { email: me.user.email, password: 'wrong password!!' });
  assert.equal((await h.anon('POST', '/api/auth/login', { email: me.user.email, password: TEST_PASSWORD })).status, 429);
  await h.settle();
});

test('big bodies are refused before parsing', async () => {
  const h = createHarness();
  const me = await h.owner();
  const res = await me.api('POST', '/api/projects', JSON.stringify({ name: 'x', handle: 'x', description: 'y'.repeat(70_000) }));
  assert.equal(res.status, 413);
});

test('security headers on pages and API; config names the model, never the key', async () => {
  const key = 'gsk_super_secret_value_1234567890';
  const h = createHarness({ env: { LLM_API_KEY: key } });
  const me = await h.owner();
  const res = await h.app.request('/api/health');
  assert.match(res.headers.get('content-security-policy')!, /default-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(res.headers.get('referrer-policy'));
  const config = await me.api('GET', '/api/config');
  assert.equal(config.status, 200);
  assert.equal(config.body.platforms.length, 6);
  assert.ok(!JSON.stringify(config.body).includes(key));
  assert.equal((await h.anon('GET', '/api/config')).status, 401);
  // unknown API paths are JSON 404s, not the web app
  const missing = await me.api('GET', '/api/nope');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, 'NOT_FOUND');
});

test('errors keep the same shape everywhere', async () => {
  const h = createHarness();
  const me = await h.owner();
  const p = await h.project(me);
  const bad = await me.api('POST', `/api/projects/${p.id}/rehearsals`, { text: '' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'VALIDATION_FAILED');
  assert.ok(bad.body.error.message);
  const notUuid = await me.api('GET', '/api/projects/not-a-uuid');
  assert.equal(notUuid.status, 400);
});

test('launch advice: start, read, list and delete, with a model and with research only', async () => {
  const model = await startModelServer();
  after(() => model.close());
  const h = createHarness({ agents: modelAgents(model.url), searchSources: ['sample'] });
  const me = await h.owner();
  const p = await h.project(me);
  const config = await me.api('GET', '/api/config');
  assert.equal(config.body.advisor.mode, 'full');
  assert.equal(config.body.advisor.agents.scout.name, 'Bramble the Scout');
  assert.ok(!JSON.stringify(config.body).includes('test-key'));

  const bad = await me.api('POST', `/api/projects/${p.id}/advice`, { product: 'X', pitch: 'short' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'VALIDATION_FAILED');
  const started = await me.api('POST', `/api/projects/${p.id}/advice`, { ...ADVICE, currency: 'EUR', buyers: 6 });
  assert.equal(started.status, 202, JSON.stringify(started.body));
  await h.settle();
  const got = await me.api('GET', `/api/projects/${p.id}/advice/${started.body.advice.id}`);
  assert.equal(got.body.advice.status, 'done', got.body.advice.error);
  assert.equal(got.body.advice.result.pricing.currency, 'EUR');
  assert.equal(got.body.advice.result.buyers.length, 6);
  const listed = await me.api('GET', `/api/projects/${p.id}/advice`);
  assert.equal(listed.body.advice.length, 1);
  assert.equal(listed.body.advice[0].result, null, 'lists leave out the full report');
  assert.equal((await me.api('DELETE', `/api/projects/${p.id}/advice/${started.body.advice.id}`)).status, 200);
  assert.equal((await me.api('GET', `/api/projects/${p.id}/advice/${started.body.advice.id}`)).status, 404);

  // through a project key, and never across projects
  const key = (await me.api('POST', `/api/projects/${p.id}/keys`, { name: 'CI' })).body.secret;
  const bearer = { authorization: `Bearer ${key}` };
  const viaKey = await h.anon('POST', '/api/v1/advice', ADVICE, bearer);
  assert.equal(viaKey.status, 202, JSON.stringify(viaKey.body));
  await h.settle();
  assert.equal((await h.anon('GET', `/api/v1/advice/${viaKey.body.advice.id}`, undefined, bearer)).body.advice.status, 'done');
  const other = await h.project(me, { name: 'Other' });
  const theirs = await me.api('POST', `/api/projects/${other.id}/advice`, ADVICE);
  await h.settle();
  assert.equal((await h.anon('GET', `/api/v1/advice/${theirs.body.advice.id}`, undefined, bearer)).status, 404);
  assert.equal((await h.anon('GET', '/api/v1/advice', undefined, bearer)).body.advice.length, 1);

  // the daily cap is per project
  for (let i = 0; i < 3; i++) await me.api('POST', `/api/projects/${p.id}/advice`, ADVICE);
  const capped = await me.api('POST', `/api/projects/${p.id}/advice`, ADVICE);
  assert.equal(capped.status, 429);
  assert.equal(capped.body.error.code, 'RATE_LIMITED');
  await h.settle();

  // with no model the run is research only
  const offline = createHarness({ searchSources: ['sample'] });
  const o = await offline.owner();
  const op = await offline.project(o);
  assert.equal((await o.api('GET', '/api/config')).body.advisor.mode, 'offline');
  const r = await o.api('POST', `/api/projects/${op.id}/advice`, ADVICE);
  await offline.settle();
  const done = (await o.api('GET', `/api/projects/${op.id}/advice/${r.body.advice.id}`)).body.advice;
  assert.equal(done.result.mode, 'offline');
  assert.equal(done.result.plan, null);
});
