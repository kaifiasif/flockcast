import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { isPrivateAddress } from '../src/core/webhooks.ts';
import { createHarness, type Client, type Harness, type Json } from './helpers.ts';

const POST = 'Most AI drafts fail in the same place. Read yours backwards before you post.';

/** A team: the owner, plus an editor, a reviewer and a viewer who joined through invite links. */
async function team(h: Harness) {
  const owner = await h.owner();
  const p = await h.project(owner);
  const join = async (email: string, role: string): Promise<Client> => {
    const inv = await owner.api('POST', `/api/projects/${p.id}/invites`, { role });
    assert.equal(inv.status, 201, JSON.stringify(inv.body));
    assert.match(inv.body.path, /^#\/join\/inv_/);
    const who = await h.signUp(email);
    const ok = await who.api('POST', '/api/invites/accept', { token: inv.body.token });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.project.role, role);
    return who;
  };
  return { owner, p, editor: await join('ed@example.com', 'editor'), reviewer: await join('rev@example.com', 'reviewer'), viewer: await join('view@example.com', 'viewer') };
}

test('plans gate features and limits; plans off (the default) unlocks everything', async () => {
  const h = createHarness({ env: { FLOCKCAST_PLANS: 'on', REHEARSAL_SIGNUP: 'open' } });
  const me = await h.owner();
  assert.equal(me.user.email, 'owner@example.com');
  const p = await h.project(me);
  const refused = async (method: string, path: string, body?: unknown) => {
    const r = await me.api(method, path, body);
    assert.equal(r.status, 403, `${method} ${path}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.error.code, 'PLAN_REQUIRED');
    return r.body.error.message as string;
  };
  assert.match(await refused('POST', `/api/projects/${p.id}/comparisons`, { drafts: [{ text: 'a b' }, { text: 'c d' }] }), /Creator plan/);
  assert.match(await refused('POST', `/api/projects/${p.id}/rehearsals`, { text: POST, personas: 20 }), /up to 12 followers/);
  await refused('POST', `/api/projects/${p.id}/keys`, { name: 'CI' });
  await refused('POST', `/api/projects/${p.id}/invites`, { role: 'editor' });
  await refused('POST', '/api/projects', { name: 'Second', handle: '@k' });
  assert.equal((await me.api('POST', `/api/projects/${p.id}/rehearsals`, { text: POST })).status, 202, 'free still rehearses');
  await h.settle();

  h.ctx.accounts.setPlan('owner@example.com', 'studio');
  assert.equal((await me.api('GET', '/api/auth/session')).body.user.plan, 'studio');
  assert.equal((await me.api('POST', `/api/projects/${p.id}/comparisons`, { drafts: [{ text: 'Hook one.' }, { text: 'Hook two.' }] })).status, 202);
  assert.equal((await me.api('POST', `/api/projects/${p.id}/invites`, { role: 'viewer' })).status, 201);
  await refused('GET', `/api/projects/${p.id}/audit`);
  const usage = (await me.api('GET', `/api/projects/${p.id}/usage`)).body;
  assert.equal(usage.plan.id, 'studio');
  assert.equal(usage.month.rehearsals, 3);
  await h.settle();

  // a key stops working when the owner's plan no longer includes the API
  const key = (await me.api('POST', `/api/projects/${p.id}/keys`, { name: 'CI' })).body.secret;
  h.ctx.accounts.setPlan('owner@example.com', 'free');
  const v1 = await h.anon('GET', '/api/v1/project', undefined, { authorization: `Bearer ${key}` });
  assert.equal(v1.status, 403);
  assert.equal(v1.body.error.code, 'PLAN_REQUIRED');

  const open = createHarness();
  const o = await open.owner();
  const op = await open.project(o);
  assert.equal((await o.api('GET', `/api/projects/${op.id}/usage`)).body.plan.id, 'enterprise');
  assert.equal((await o.api('GET', `/api/projects/${op.id}/audit`)).status, 200);
});

test('teams: invite links, roles decide what each person can do, strangers see 404', async () => {
  const h = createHarness({ env: { REHEARSAL_SIGNUP: 'open' } });
  const { owner, p, editor, reviewer, viewer } = await team(h);
  const stranger = await h.signUp('stranger@example.com');

  const members = (await viewer.api('GET', `/api/projects/${p.id}/members`)).body;
  assert.deepEqual(members.members.map((m: Json) => m.role).sort(), ['editor', 'owner', 'reviewer', 'viewer']);
  assert.deepEqual(members.invites, [], 'only the owner sees invite links');
  assert.equal((await owner.api('GET', `/api/projects/${p.id}/members`)).body.invites.length, 3);
  assert.equal((await viewer.api('GET', '/api/projects')).body.projects[0].role, 'viewer');

  // editors rehearse; viewers and reviewers read
  const started = await editor.api('POST', `/api/projects/${p.id}/rehearsals`, { text: POST });
  assert.equal(started.status, 202);
  await h.settle();
  const rid = started.body.rehearsal.id;
  assert.equal((await viewer.api('GET', `/api/projects/${p.id}/rehearsals/${rid}`)).status, 200);
  for (const [who, method, path, body] of [
    [viewer, 'POST', `/api/projects/${p.id}/rehearsals`, { text: POST }],
    [reviewer, 'DELETE', `/api/projects/${p.id}/rehearsals/${rid}`],
    [editor, 'PUT', `/api/projects/${p.id}`, { name: 'Mine now', handle: '@x' }],
    [editor, 'GET', `/api/projects/${p.id}/keys`],
    [editor, 'POST', `/api/projects/${p.id}/invites`, { role: 'editor' }],
    [viewer, 'DELETE', `/api/projects/${p.id}`],
  ] as const) {
    const r = await who.api(method, path, body);
    assert.equal(r.status, 403, `${method} ${path} gave ${r.status}`);
    assert.equal(r.body.error.code, 'FORBIDDEN');
  }
  for (const path of [`/api/projects/${p.id}`, `/api/projects/${p.id}/members`, `/api/projects/${p.id}/rehearsals/${rid}`, `/api/projects/${p.id}/usage`]) {
    assert.equal((await stranger.api('GET', path)).status, 404, path);
  }

  // the owner changes roles and removes people; members can leave; links work once
  const viewerId = viewer.user.id;
  assert.equal((await owner.api('PUT', `/api/projects/${p.id}/members/${viewerId}`, { role: 'editor' })).status, 200);
  assert.equal((await viewer.api('POST', `/api/projects/${p.id}/rehearsals`, { text: `${POST} Again.` })).status, 202);
  await h.settle();
  assert.equal((await reviewer.api('DELETE', `/api/projects/${p.id}/members/${reviewer.user.id}`)).status, 200);
  assert.equal((await reviewer.api('GET', `/api/projects/${p.id}`)).status, 404, 'gone after leaving');
  assert.equal((await owner.api('DELETE', `/api/projects/${p.id}/members/${owner.user.id}`)).status, 409);

  const inv = await owner.api('POST', `/api/projects/${p.id}/invites`, { role: 'viewer' });
  assert.equal((await stranger.api('POST', '/api/invites/accept', { token: inv.body.token })).status, 200);
  const again = await h.signUp('late@example.com');
  assert.equal((await again.api('POST', '/api/invites/accept', { token: inv.body.token })).status, 404, 'a link works once');
  const revoked = await owner.api('POST', `/api/projects/${p.id}/invites`, { role: 'viewer' });
  assert.equal((await owner.api('DELETE', `/api/projects/${p.id}/invites/${revoked.body.invite.id}`)).status, 200);
  assert.equal((await again.api('POST', '/api/invites/accept', { token: revoked.body.token })).status, 404);
  assert.equal((await again.api('POST', '/api/invites/accept', { token: 'inv_nope' })).status, 400);
});

test('approvals: an editor asks, a reviewer decides, nobody approves their own, and webhooks are signed', async () => {
  const received: { headers: Record<string, string | string[] | undefined>; body: string }[] = [];
  const hook = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ headers: req.headers, body });
      res.writeHead(204).end();
    });
  });
  await new Promise<void>((r) => hook.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(hook.address() as { port: number }).port}/flockcast`;
  try {
    const h = createHarness({ env: { REHEARSAL_SIGNUP: 'open', WEBHOOKS_ALLOW_PRIVATE: '1' } });
    const { owner, p, editor, reviewer, viewer } = await team(h);
    const made = await owner.api('POST', `/api/projects/${p.id}/webhooks`, { url, events: ['rehearsal.finished', 'approval.requested', 'approval.decided'] });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const secret: string = made.body.secret;
    assert.match(secret, /^whsec_/);
    assert.ok(!JSON.stringify((await owner.api('GET', `/api/projects/${p.id}/webhooks`)).body).includes(secret), 'the secret is shown once');

    const rid = (await editor.api('POST', `/api/projects/${p.id}/rehearsals`, { text: POST })).body.rehearsal.id;
    await h.settle();
    const asked = await editor.api('POST', `/api/projects/${p.id}/rehearsals/${rid}/approval`, { note: 'Going out Tuesday' });
    assert.equal(asked.status, 201, JSON.stringify(asked.body));
    const aid = asked.body.approval.id;
    assert.equal((await viewer.api('POST', `/api/projects/${p.id}/approvals/${aid}/decision`, { decision: 'approved' })).status, 403);
    assert.equal((await editor.api('POST', `/api/projects/${p.id}/approvals/${aid}/decision`, { decision: 'approved' })).status, 403, 'editors cannot review');
    const ownerAsks = await owner.api('POST', `/api/projects/${p.id}/rehearsals/${rid}/approval`, {});
    assert.equal((await owner.api('POST', `/api/projects/${p.id}/approvals/${ownerAsks.body.approval.id}/decision`, { decision: 'approved' })).status, 409, 'not your own request');
    const editorAsks = await editor.api('POST', `/api/projects/${p.id}/rehearsals/${rid}/approval`, { note: 'Second try' });
    const decided = await reviewer.api('POST', `/api/projects/${p.id}/approvals/${editorAsks.body.approval.id}/decision`, { decision: 'changes_requested', comment: 'Cite the study.' });
    assert.equal(decided.status, 200, JSON.stringify(decided.body));
    assert.equal(decided.body.approval.decided_by_email, 'rev@example.com');
    const latest = (await viewer.api('GET', `/api/projects/${p.id}/rehearsals/${rid}/approval`)).body.approval;
    assert.equal(latest.status, 'changes_requested');
    assert.equal((await viewer.api('GET', `/api/projects/${p.id}/approvals?status=withdrawn`)).body.approvals.length, 2, 'a new request replaces the open one');

    await new Promise((r) => setTimeout(r, 200));
    const events = received.map((r) => r.headers['flockcast-event']);
    assert.ok(events.includes('rehearsal.finished') && events.includes('approval.requested') && events.includes('approval.decided'), events.join());
    for (const r of received) {
      const [t, v1] = String(r.headers['flockcast-signature']).split(',').map((x) => x.split('=')[1]);
      assert.equal(v1, createHmac('sha256', secret).update(`${t}.${r.body}`).digest('hex'), 'signature checks out');
    }
    const ping = await owner.api('POST', `/api/projects/${p.id}/webhooks/${made.body.webhook.id}/test`);
    assert.deepEqual(ping.body.delivery, { status: 204, error: null });
    assert.equal((await owner.api('GET', `/api/projects/${p.id}/webhooks`)).body.webhooks[0].last_status, 204);
  } finally {
    hook.close();
  }
});

test('webhooks refuse private and local targets unless the operator allows them', async () => {
  const h = createHarness();
  const me = await h.owner();
  const p = await h.project(me);
  for (const url of ['http://example.com/hook', 'https://127.0.0.1/hook', 'https://localhost:8443/x', 'https://[::1]/x', 'https://10.0.0.5/x', 'https://user:pw@example.com/x', 'not a url']) {
    const r = await me.api('POST', `/api/projects/${p.id}/webhooks`, { url, events: ['rehearsal.finished'] });
    assert.equal(r.status, 400, `${url}: ${JSON.stringify(r.body)}`);
  }
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) assert.ok(isPrivateAddress(ip), ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.ok(!isPrivateAddress(ip), ip);
});

test('audit log and export: owners see who did what, exports are safe to open in a spreadsheet', async () => {
  const h = createHarness({ env: { REHEARSAL_SIGNUP: 'open' } });
  const { owner, p, editor, viewer } = await team(h);
  await editor.api('POST', `/api/projects/${p.id}/rehearsals`, { text: '=HYPERLINK("http://evil") read backwards', title: '=cmd' });
  await h.settle();
  const audit = await owner.api('GET', `/api/projects/${p.id}/audit`);
  assert.equal(audit.status, 200);
  const actions = audit.body.events.map((e: Json) => `${e.action} by ${e.actor}`);
  assert.ok(actions.includes('rehearsal.started by ed@example.com'), actions.join('\n'));
  assert.ok(actions.some((a: string) => a.startsWith('member.joined by view@example.com')));
  assert.equal((await editor.api('GET', `/api/projects/${p.id}/audit`)).status, 403);
  const csv = await owner.api('GET', `/api/projects/${p.id}/audit/csv`);
  assert.match(csv.headers.get('content-type') ?? '', /text\/csv/);
  assert.match(csv.body as string, /^at,actor,action,target,details\r\n/);

  const exp = await editor.api('GET', `/api/projects/${p.id}/export?format=csv`);
  assert.equal(exp.status, 200);
  assert.ok((exp.body as string).includes(`"'=HYPERLINK(""http://evil"") read backwards"`), 'formulas are neutralised');
  assert.ok((exp.body as string).includes(",'=cmd,"));
  const json = await editor.api('GET', `/api/projects/${p.id}/export`);
  assert.equal(json.body.rehearsals.length, 1);
  assert.equal(json.body.rehearsals[0].state, undefined, 'no engine memory in exports');
  assert.equal((await viewer.api('GET', `/api/projects/${p.id}/export`)).status, 403);
  assert.ok((await owner.api('GET', `/api/projects/${p.id}/audit`)).body.events.some((e: Json) => e.action === 'project.exported'));
});
