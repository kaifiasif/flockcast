/** The HTTP app end to end: accounts, projects, rehearsals, API keys, and the security baseline. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentStep, totpCode } from '../src/modules/auth/totp.ts';
import { createHarness, TEST_PASSWORD } from './helpers.ts';

const POST = 'Fluent sentences are the dangerous ones. Reviewers skim them and forty percent of errors hide there.';

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
  const k = await me.api('POST', `/api/projects/${p.id}/keys`, { name: 'Creator OS' });
  const rid = r.body.rehearsal.id;
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
  ] as const) {
    const res = await them.api(method, path, body);
    assert.equal(res.status, 404, `${method} ${path} gave ${res.status}`);
  }
  assert.equal((await them.api('GET', '/api/projects')).body.projects.length, 0);
  // and a rehearsal id under the wrong project of the right user is also not found
  const p2 = await h.project(me, { name: 'Other' });
  assert.equal((await me.api('GET', `/api/projects/${p2.id}/rehearsals/${rid}`)).status, 404);
});

test('API keys: shown once, hashed, one project only, revocable', async () => {
  const h = createHarness();
  const me = await h.owner();
  const p = await h.project(me);
  const other = await h.project(me, { name: 'Other' });
  const made = await me.api('POST', `/api/projects/${p.id}/keys`, { name: 'Creator OS' });
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
