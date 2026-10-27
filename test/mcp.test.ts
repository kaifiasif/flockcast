/** The MCP server (mcp/flockcast_mcp.py) end to end: a real assistant-style session over stdio against the HTTP API. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { serve } from '@hono/node-server';
import { swarmEngine } from '../engine/index.ts';
import { startModelServer } from './fake-model.ts';
import { createHarness, modelAgents, type Json } from './helpers.ts';

function mcpSession(env: Record<string, string>) {
  const child = spawn(process.env.FLOCKCAST_PYTHON ?? 'python3', ['-B', 'mcp/flockcast_mcp.py'], { env: { ...process.env, FLOCKCAST_POLL_SECONDS: '0.05', ...env } });
  const waiting = new Map<number, (m: Json) => void>();
  createInterface({ input: child.stdout }).on('line', (line) => {
    const m = JSON.parse(line);
    waiting.get(m.id)?.(m);
  });
  let next = 1;
  const rpc = (method: string, params: Json = {}) =>
    new Promise<Json>((resolve) => {
      const id = next++;
      waiting.set(id, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  const tool = async (name: string, args: Json) => {
    const r = await rpc('tools/call', { name, arguments: args });
    const text = r.result.content[0].text;
    return { isError: r.result.isError === true, text, body: r.result.isError ? null : JSON.parse(text) };
  };
  return { rpc, tool, notify: (method: string) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n'), close: () => child.kill() };
}

test('an assistant rehearses, asks a follower, compares and runs a study through MCP', async (t) => {
  const model = await startModelServer();
  t.after(() => model.close());
  const h = createHarness({ engine: swarmEngine({ agents: modelAgents(model.url) }), agents: modelAgents(model.url) });
  const me = await h.owner();
  const p = await h.project(me, { personas: 4, rounds: 1 });
  const other = await h.project(me, { name: 'Other' });
  const key = (await me.api('POST', `/api/projects/${p.id}/keys`, { name: 'Claude' })).body.secret;
  const server = serve({ fetch: h.app.fetch, hostname: '127.0.0.1', port: 0 });
  await new Promise((r) => server.once('listening', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const mcp = mcpSession({ FLOCKCAST_URL: url, FLOCKCAST_KEY: key });
  t.after(() => (mcp.close(), server.close()));

  const init = await mcp.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(init.result.serverInfo.name, 'flockcast');
  assert.equal(init.result.protocolVersion, '2025-06-18');
  mcp.notify('notifications/initialized');
  const names = (await mcp.rpc('tools/list')).result.tools.map((x: Json) => x.name);
  for (const n of ['rehearse_post', 'ask_follower', 'compare_drafts', 'focus_group', 'message_test', 'crisis_rehearsal', 'launch_advice']) assert.ok(names.includes(n), n);

  const r = await mcp.tool('rehearse_post', { text: 'Fluent sentences are the dangerous ones. Forty percent of errors hide there.' });
  assert.equal(r.isError, false, r.text);
  assert.equal(r.body.status, 'done');
  assert.ok(r.body.result.personas.length >= 2);
  assert.ok(!('state' in r.body), 'engine memory never leaves the server');

  const reply = await mcp.tool('ask_follower', { rehearsal_id: r.body.id, agent_id: r.body.result.personas[0].id, prompt: 'Would you share it?' });
  assert.equal(reply.isError, false, reply.text);
  assert.ok(reply.body.answer.length > 0, reply.text);

  const cmp = await mcp.tool('compare_drafts', { drafts: [{ text: 'Hook one about drafts.' }, { text: 'Hook two about drafts.' }] });
  assert.equal(cmp.body.status, 'done', cmp.text);
  assert.equal(cmp.body.rehearsals.length, 2);
  assert.ok(['A', 'B'].includes(cmp.body.crowd_pick));

  const crisis = await mcp.tool('crisis_rehearsal', { situation: 'Checkout was down for 6 hours.', statement: 'We are sorry. Checkout was down for 6 hours. We will share what we change by Friday.', rounds: 1 });
  assert.equal(crisis.body.status, 'done', crisis.text);
  assert.equal(crisis.body.result.kind, 'crisis');

  // the key reaches its own project only, and bad input comes back as a tool error, not a crash
  const stranger = await me.api('POST', `/api/projects/${other.id}/rehearsals`, { text: 'Not yours.' });
  const foreign = await mcp.tool('get_rehearsal', { id: stranger.body.rehearsal.id });
  assert.equal(foreign.isError, true);
  assert.equal((await mcp.tool('get_rehearsal', { id: '../project' })).isError, true);
  assert.equal((await mcp.tool('message_test', { messages: [{ text: 'Only one' }], segments: [{ name: 'Founders' }] })).isError, true);
  assert.equal((await mcp.rpc('tools/call', { name: 'nope', arguments: {} })).error.code, -32602);
  assert.equal((await mcp.rpc('resources/list')).error.code, -32601);
});

test('a wrong key is a clear tool error', async (t) => {
  const h = createHarness();
  const server = serve({ fetch: h.app.fetch, hostname: '127.0.0.1', port: 0 });
  await new Promise((r) => server.once('listening', r));
  const mcp = mcpSession({ FLOCKCAST_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, FLOCKCAST_KEY: 'flk_wrong' });
  t.after(() => (mcp.close(), server.close()));
  const res = await mcp.tool('calibration', {});
  assert.equal(res.isError, true);
  assert.doesNotMatch(res.text, /Traceback/);
});
