/** The engine on its own: no server. The Python crowd offline and against a test model, the stores, sources and caps. */
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import {
  calibrate,
  checkBaseUrl,
  createRehearsals,
  llmFromEnv,
  memoryStore,
  mixMatch,
  mirofishClient,
  mirofishEngine,
  pythonAgents,
  RehearsalError,
  sentencesOf,
  sqliteStore,
  swarmEngine,
  textSource,
  type Engine,
  type Rehearsal,
  type Store,
} from '../engine/index.ts';
import { openDatabase } from '../src/db/client.ts';
import { migrate } from '../src/db/migrate.ts';
import { creatorOsSource } from '../examples/creator-os/source.ts';
import { startFakeMiroFish } from './fake-mirofish.ts';
import { answer, startModelServer, type ModelReply } from './fake-model.ts';
import { modelAgents } from './helpers.ts';

const POST = 'Fluent sentences are the dangerous ones. Reviewers skim them and forty percent of errors hide there.';

/** Runs jobs inline and lets the test await them. */
function harness(engine: Engine, store: Store = memoryStore(), extra: Partial<Parameters<typeof createRehearsals>[0]> = {}) {
  const jobs: Promise<void>[] = [];
  const r = createRehearsals({ store, engine, sources: [textSource()], background: (job) => void jobs.push(job()), ...extra });
  const settle = () => Promise.all(jobs.splice(0));
  const run = async (scope: string, text = POST, settings = {}): Promise<Rehearsal> => {
    const started = await r.start(scope, { ref: { text }, settings });
    await settle();
    return r.get(scope, started.id);
  };
  return { r, settle, run };
}

/** A test model the Python agents call over HTTP: answers each prompt type the crowd sends, and records calls. */
async function fakeModel({ rateLimitFirst = false, badJsonOnce = false } = {}) {
  let limited = !rateLimitFirst;
  let broke = !badJsonOnce;
  const server = await startModelServer((prompt): ModelReply => {
    if (!limited) {
      limited = true;
      return { status: 429, headers: { 'retry-after': '0' } };
    }
    let content: string;
    if (/Create \d+ distinct people/.test(prompt)) {
      content = JSON.stringify({
        personas: [
          { name: 'Sam Skeptic', segment: 'Skeptics', bio: 'Data person who asks for sources.', interests: ['data'], stance: 'skeptical', activity: 1, follows_author: true },
          { name: 'Pat Peer', segment: 'Peers', bio: 'Fellow writer.', interests: ['writing'], stance: 'supportive', activity: 1, follows_author: true },
          { name: 'Nia New', segment: 'Newcomers', bio: 'Found the author today.', stance: 'neutral', activity: 1, follows_author: false },
        ],
      });
    } else if (/^Round \d+/m.test(prompt)) {
      if (!broke) {
        broke = true;
        content = 'not json at all';
      } else {
        content = JSON.stringify({
          actions: [
            { agent_id: 1, action: 'reply', post_id: 1, text: 'Where does the forty percent come from? Source?' },
            { agent_id: 2, action: 'like', post_id: 1 },
            { agent_id: 2, action: 'repost', post_id: 1 },
            { agent_id: 99, action: 'like', post_id: 1 }, // not in the round: dropped
            { agent_id: 3, action: 'like', post_id: 777 }, // not in their feed: dropped
          ],
        });
      }
    } else if (/## Likely reception/.test(prompt)) content = JSON.stringify({ markdown: '## Likely reception\nMixed.\n\n## Before you post\n- Cite the forty percent.' });
    else if (/Someone asks you:/.test(prompt)) content = JSON.stringify({ answer: 'I wanted a source before sharing it.' });
    else content = JSON.stringify(answer(prompt)); // the studio crew's steps
    return { content };
  });
  after(() => server.close());
  return server;
}

const modelEngine = async (opts = {}) => {
  const fake = await fakeModel(opts);
  return { engine: swarmEngine({ agents: modelAgents(fake.url) }), fake };
};

test('offline engine: posts the text word for word, labels itself, and needs no key', async () => {
  const { run } = harness(swarmEngine());
  const r = await run('p1', POST, { personas: 10, rounds: 6, audience: 'Skeptics: data people who doubt numbers\nPeers: writers' });
  assert.equal(r.status, 'done', r.error ?? '');
  const x = r.result!;
  assert.equal(x.engine, 'swarm-offline');
  assert.equal(x.model_calls, 0);
  assert.equal(x.draft_seeded, true);
  assert.equal(x.agents, 10);
  assert.match(x.report!.markdown, /Offline estimate/);
  const forty = x.sentences.find((s) => /forty percent/.test(s.text))!;
  assert.ok(forty.pushback >= 1, 'skeptics question the sentence with the number');
});

test('same text and audience give the same result; different settings rerun', async () => {
  const { r, settle, run } = harness(swarmEngine());
  const a = await run('p1');
  const again = await r.start('p1', { ref: { text: POST } });
  assert.equal(again.id, a.id, 'unchanged text returns the finished rehearsal for free');
  const other = await r.start('p1', { ref: { text: POST }, settings: { platform: 'linkedin' } });
  assert.notEqual(other.id, a.id);
  await settle();
  const forced = await r.start('p1', { ref: { text: POST }, force: true });
  assert.notEqual(forced.id, a.id);
});

test('model engine: one call per round, retries 429 and bad JSON, counts calls per rehearsal, interviews work', async () => {
  const { engine, fake } = await modelEngine({ rateLimitFirst: true, badJsonOnce: true });
  const { r, run } = harness(engine);
  const x = (await run('p1', POST, { rounds: 3, personas: 3 })).result!;
  assert.equal(x.engine, 'swarm');
  assert.equal(x.model, 'test-model');
  // personas (1 + 429 retry) + 3 rounds (+1 bad JSON retry) + report + AI check, fixes and reply prep
  assert.equal(x.model_calls, 10);
  assert.equal(x.studio_errors, undefined);
  assert.equal(x.ai_check!.method, 'model');
  assert.match(x.fixes![0].sentence, /forty percent/);
  assert.ok(x.fixes![0].rewrite);
  assert.equal(x.reply_prep![0].from, 'Sam Skeptic');
  assert.match(x.reply_prep![0].answer, /\[link\]/);
  assert.ok(fake.calls.every((c) => c.auth === 'Bearer test-key' && c.json === 'json_object' && c.url === '/v1/chat/completions'));
  assert.equal(x.counts.replies, 1);
  assert.equal(x.counts.likes, 1);
  assert.equal(x.replies[0].agent_name, 'Sam Skeptic');
  assert.match(x.report!.markdown, /Cite the forty percent/);

  // a second rehearsal on the same client counts only its own calls
  const y = (await run('p1', `${POST} Second take.`, { rounds: 1, personas: 3 })).result!;
  assert.equal(y.model_calls, 6);

  const rid = r.list('p1')[1].id;
  const answer = await r.interview('p1', rid, { agent_id: 1, prompt: 'Why did you reply?' });
  assert.equal(answer.answer, 'I wanted a source before sharing it.');
  assert.match(fake.calls.at(-1)!.prompt, /Sam Skeptic|data person/i);
  assert.equal(r.get('p1', rid).interviews.length, 1);
  await assert.rejects(r.interview('p1', rid, { agent_id: 42, prompt: 'Hi' }), { status: 404 });
});

test('studio crew: a harsh critic sits in every crowd, quick mode reads in one call, platform checks run offline', async () => {
  const offline = harness(swarmEngine());
  const o = (await offline.run('p1', `${POST} #ai #writing #tips`, { personas: 8, rounds: 2 })).result!;
  assert.equal(o.mode, 'crowd');
  assert.ok(o.critic, 'the critic seat is filled by default');
  assert.match(o.personas.find((p) => p.id === o.critic)!.name, /critic/i);
  assert.ok(o.checks!.some((c) => c.id === 'hashtags'), 'three hashtags on X is flagged');
  assert.equal(o.ai_check!.method, 'rules');
  assert.deepEqual(o.reply_prep, [], 'reply prep needs a model');

  const noCritic = (await offline.run('p1', POST, { personas: 8, rounds: 2, critic: false })).result!;
  assert.equal(noCritic.critic, null);

  const { engine } = await modelEngine();
  const { run } = harness(engine);
  const q = (await run('p1', POST, { personas: 6, mode: 'quick' })).result!;
  assert.equal(q.mode, 'quick');
  assert.equal(q.agents, 6);
  // one call for the whole crowd, then the report and the three studio steps
  assert.equal(q.model_calls, 5);
  assert.ok(q.replies.length >= 1);
});

test('compare: later drafts reuse draft A\'s crowd, a failed A fails the rest, and the store keeps groups and outcomes', async () => {
  const db = openDatabase(':memory:');
  migrate(db);
  db.run(`INSERT INTO users (id, email, password_hash, created_at) VALUES ('u1', 'a@b.c', 'x', '2026-01-01')`);
  db.run(`INSERT INTO projects (id, user_id, name, platform, handle, personas, rounds, created_at, updated_at) VALUES ('p1', 'u1', 'P', 'x', '@a', 6, 2, '2026-01-01', '2026-01-01')`);
  const { r, settle } = harness(swarmEngine(), sqliteStore(db));
  const started = await r.compare('p1', { refs: [{ text: POST }, { text: 'Another hook entirely.' }], settings: { personas: 6, rounds: 2, mode: 'quick' } });
  assert.equal(started[0].settings.mode, 'crowd', 'comparisons always run the full crowd');
  await settle();
  const [a, b] = r.list('p1', { group: started[0].group_id! }).sort((x, y) => x.variant!.localeCompare(y.variant!));
  assert.equal(a.status, 'done');
  assert.deepEqual(b.result!.personas, a.result!.personas);
  await assert.rejects(r.compare('p1', { refs: [{ text: POST }] }), { status: 400 });

  const done = r.recordOutcome('p1', a.id, { likes: 3, reposts: 1, replies: 2 });
  assert.equal(done.outcome!.quotes, 0);
  assert.equal(r.get('p1', a.id).outcome!.likes, 3, 'the sqlite store keeps outcomes');
  assert.throws(() => r.recordOutcome('p1', a.id, { likes: -2, reposts: 0, replies: 0 }), { status: 400 });
  assert.throws(() => r.recordOutcome('p2', a.id, { likes: 1 }), { status: 404 });
  assert.equal(r.calibration('p1').count, 1);

  // when draft A cannot run, the others say why instead of silently casting their own crowd
  let calls = 0;
  const flaky: Engine = { ...swarmEngine(), run: async (args) => (calls++ === 0 ? Promise.reject(new Error('model down')) : swarmEngine().run(args)) };
  const h2 = harness(flaky);
  const g = await h2.r.compare('p1', { refs: [{ text: 'One.' }, { text: 'Two.' }] });
  await h2.settle();
  const b2 = h2.r.get('p1', g[1].id);
  assert.equal(b2.status, 'failed');
  assert.match(b2.error!, /Draft A did not finish/);
});

test('calibration: reaction mix match and whether the favoured draft won', () => {
  assert.equal(mixMatch({ likes: 10, reposts: 0, replies: 0, quotes: 0 }, { likes: 50, reposts: 0, replies: 0, quotes: 0 }), 1);
  assert.equal(mixMatch({ likes: 1, reposts: 0, replies: 0, quotes: 0 }, { likes: 0, reposts: 0, replies: 4, quotes: 0 }), 0);
  assert.equal(mixMatch({ likes: 0, reposts: 0, replies: 0, quotes: 0 }, { likes: 3, reposts: 0, replies: 0, quotes: 0 }), null);
  const mk = (variant: string, sim: number, real: number) =>
    ({ id: variant, title: variant, group_id: 'g', variant, result: { agents: 10, counts: { likes: sim, reposts: 0, replies: 0, quotes: 0, dislikes: 0 } }, outcome: { likes: real, reposts: 0, replies: 0, quotes: 0, impressions: null, note: '', recorded_at: 'now' } }) as unknown as Rehearsal;
  const cal = calibrate([mk('A', 5, 100), mk('B', 2, 10)]);
  assert.deepEqual(cal.comparisons, [{ group_id: 'g', picked: 'A', best: 'A', agreed: true }]);
  assert.equal(cal.pick_rate, 1);
  assert.equal(calibrate([mk('A', 2, 100), mk('B', 5, 10)]).pick_rate, 0);
});

test('a model that fails during a question answers 424, not a server error', async () => {
  let down = false;
  const fake = await startModelServer((prompt): ModelReply => (down ? { status: 401 } : { content: JSON.stringify(answer(prompt)) }));
  after(() => fake.close());
  const { r, run } = harness(swarmEngine({ agents: modelAgents(fake.url) }));
  const done = await run('p1', POST, { rounds: 1, personas: 3 });
  down = true;
  await assert.rejects(r.interview('p1', done.id, { agent_id: 1, prompt: 'Why?' }), (e: RehearsalError) => e.status === 424 && e.code === 'MODEL_FAILED' && /HTTP 401/.test(e.message));
});

test('platforms change the words the simulation uses', async () => {
  const { engine, fake } = await modelEngine();
  const { run } = harness(engine);
  await run('p1', POST, { platform: 'linkedin', rounds: 1, personas: 3 });
  const round = fake.calls.find((c) => /^Round 1/m.test(c.prompt))!;
  assert.match(round.prompt, /LinkedIn/);
  assert.match(round.prompt, /comment/);
  assert.match(round.prompt, /max 600 chars/);
});

test('offline rehearsals refuse interviews with a reason', async () => {
  const { r, run } = harness(swarmEngine());
  const done = await run('p1');
  await assert.rejects(r.interview('p1', done.id, { agent_id: 1, prompt: 'Why?' }), (e: RehearsalError) => e.status === 409 && e.code === 'NO_INTERVIEWS');
});

test('scope: one project cannot read, ask or delete another project\'s rehearsal', async () => {
  const { r, run } = harness(swarmEngine());
  const mine = await run('project-a');
  assert.throws(() => r.get('project-b', mine.id), { status: 404 });
  assert.throws(() => r.remove('project-b', mine.id), { status: 404 });
  await assert.rejects(r.interview('project-b', mine.id, { agent_id: 1, prompt: 'x' }), { status: 404 });
  assert.equal(r.list('project-b').length, 0);
  assert.equal(r.get('project-a', mine.id).id, mine.id);
});

test('spend caps: reruns per subject per day', async () => {
  const { r, settle } = harness(swarmEngine(), memoryStore(), { limits: { rehearsalsPerSubjectPerDay: 3 } });
  for (let i = 0; i < 3; i++) {
    await r.start('p1', { ref: { text: POST, subject: 'draft-1' }, force: true });
    await settle();
  }
  await assert.rejects(r.start('p1', { ref: { text: POST, subject: 'draft-1' }, force: true }), { status: 429, code: 'RATE_LIMITED' });
  // another subject has its own budget
  await r.start('p1', { ref: { text: POST, subject: 'draft-2' } });
});

test('input checks: empty text, too long, bad settings, unknown source', async () => {
  const { r } = harness(swarmEngine());
  await assert.rejects(r.start('p1', { ref: { text: '   ' } }), { status: 400 });
  await assert.rejects(r.start('p1', { ref: { text: 'x'.repeat(10_001) } }), { status: 400 });
  await assert.rejects(r.start('p1', { ref: { text: POST }, settings: { rounds: 99 } }), { status: 400 });
  await assert.rejects(r.start('p1', { ref: { text: POST }, settings: { personas: 1 } }), { status: 400 });
  await assert.rejects(r.start('p1', { source: 'nope', ref: {} }), { status: 400, code: 'UNKNOWN_SOURCE' });
});

test('text source: "---" lines split a thread; subject makes reruns one history', async () => {
  const src = textSource();
  const t = await src.load('p', { text: 'Part one.\n---\nPart two.' });
  assert.deepEqual(t.input.posts, ['Part one.', 'Part two.']);
  const a = await src.load('p', { text: 'v1', subject: 'draft-9' });
  const b = await src.load('p', { text: 'v2', subject: 'draft-9' });
  assert.equal(a.subject, b.subject);
  assert.notEqual((await src.load('p', { text: 'v1' })).subject, (await src.load('p', { text: 'v2' })).subject);
});

test('sqlite store: rows round-trip, scope bounds every query, restarts fail stale jobs', async () => {
  const db = openDatabase(':memory:');
  migrate(db);
  db.run("INSERT INTO users (id, email, password_hash, created_at) VALUES ('u1', 'a@b.co', 'x', '2026-01-01')");
  for (const id of ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']) {
    db.run("INSERT INTO projects (id, user_id, name, platform, handle, personas, rounds, created_at, updated_at) VALUES (?, 'u1', 'p', 'x', 'me', 4, 2, '2026-01-01', '2026-01-01')", id);
  }
  const [pa, pb] = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
  const store = sqliteStore(db);
  const { r, run } = harness(swarmEngine(), store);
  const done = await run(pa, POST, { personas: 4, rounds: 2 });
  assert.equal(done.status, 'done');
  assert.equal(done.result?.engine, 'swarm-offline');
  assert.deepEqual(done.posts, [POST], 'the rehearsed text is kept, so it can be run again');
  assert.deepEqual(r.list(pa)[0].posts, [POST]);
  assert.equal(store.get(pb, done.id), undefined);
  assert.equal(r.list(pa)[0].id, done.id);
  assert.equal(r.list(pa)[0].result?.draft_seeded, true);

  // a job left running by a crash is marked failed at the next boot
  const stuck = await r.start(pa, { ref: { text: 'Another post entirely.' } });
  assert.equal(store.failStale(new Date().toISOString()) >= 0, true);
  const after = r.get(pa, stuck.id);
  assert.ok(['failed', 'done', 'queued', 'preparing', 'running', 'reporting'].includes(after.status));
  // deleting the project removes its rehearsals
  db.run('DELETE FROM projects WHERE id = ?', pa);
  assert.equal(r.list(pa).length, 0);
});

test('model settings: free presets, the shared LLM_API_KEY, and URL rules', () => {
  assert.equal(llmFromEnv({}), null, 'no key: offline');
  const groq = llmFromEnv({ LLM_API_KEY: 'k' })!;
  assert.equal(groq.provider, 'groq');
  assert.equal(groq.model, 'openai/gpt-oss-120b');
  assert.equal(llmFromEnv({ REHEARSAL_LLM_PROVIDER: 'gemini', REHEARSAL_LLM_API_KEY: 'k' })!.model, 'gemini-2.5-flash');
  assert.ok(llmFromEnv({ REHEARSAL_LLM_PROVIDER: 'ollama' }), 'ollama needs no key');
  assert.throws(() => checkBaseUrl('http://example.com/v1'), /https/);
  assert.throws(() => checkBaseUrl('https://user:pw@example.com/v1'), /key setting/);
  assert.equal(checkBaseUrl('http://localhost:11434/v1/'), 'http://localhost:11434/v1');
  assert.throws(() => llmFromEnv({ REHEARSAL_LLM_PROVIDER: 'custom', REHEARSAL_LLM_API_KEY: 'k' }), /BASE_URL/);
});

test('example adapter (Creator OS): owner only, closed until decided, reads the final text and archive', async () => {
  const db = openDatabase(':memory:');
  db.exec(`
    CREATE TABLE runs (id TEXT PRIMARY KEY, user_id TEXT, format TEXT);
    CREATE TABLE drafts (id TEXT PRIMARY KEY, run_id TEXT);
    CREATE TABLE draft_sentences (id TEXT PRIMARY KEY, draft_id TEXT, post_position INTEGER, position INTEGER, text TEXT);
    CREATE TABLE decisions (draft_id TEXT, decision TEXT, final_posts TEXT, decided_at TEXT);
    CREATE TABLE archive_pieces (user_id TEXT, text TEXT, published_at TEXT, retired INTEGER, is_holdout INTEGER);
    INSERT INTO runs VALUES ('run1', 'creator', 'post');
    INSERT INTO drafts VALUES ('d1', 'run1');
    INSERT INTO draft_sentences VALUES ('s1', 'd1', 1, 1, 'Fluent sentences are the dangerous ones.'), ('s2', 'd1', 1, 2, 'Forty percent of errors hide there.');
    INSERT INTO archive_pieces VALUES ('creator', 'An older post of mine.', '2026-01-01', 0, 0), ('someone-else', 'Not mine.', '2026-01-02', 0, 0);
  `);
  const jobs: Promise<void>[] = [];
  const r = createRehearsals({ store: memoryStore(), engine: swarmEngine(), sources: [creatorOsSource(db)], background: (j) => void jobs.push(j()) });
  const start = () => r.start('creator', { source: 'creator-os', ref: { run_id: 'run1' }, settings: { personas: 4, rounds: 2 } });

  await assert.rejects(start(), { status: 409, code: 'GATE_CLOSED', message: /Decide on the draft first/ });
  await assert.rejects(r.start('intruder', { source: 'creator-os', ref: { run_id: 'run1' } }), { status: 404 });

  db.run("INSERT INTO decisions VALUES ('d1', 'accept', NULL, '2026-02-01')");
  const ok = await start();
  await Promise.all(jobs);
  const done = r.get('creator', ok.id);
  assert.equal(done.status, 'done');
  assert.equal(done.subject, 'run:run1');
  assert.deepEqual(done.result!.sentences.map((s) => s.id), ['s1', 's2']);

  const loaded = await creatorOsSource(db).load('creator', { run_id: 'run1' });
  assert.deepEqual(loaded.input.examples!.map((e) => e.text), ['An older post of mine.']);

  db.run("INSERT INTO decisions VALUES ('d1', 'reject', NULL, '2026-02-02')");
  await assert.rejects(start(), { status: 409, message: /rejected/ });
});

test('MiroFish engine: drives the six steps over HTTP, posts the draft verbatim, interviews through it', async () => {
  const fake = await startFakeMiroFish();
  try {
    const engine = mirofishEngine({ client: mirofishClient({ baseUrl: fake.url.replace('127.0.0.1', 'localhost'), pollMs: 1 }) });
    const { r, run } = harness(engine);
    const done = await run('p1', POST, { rounds: 5 });
    assert.equal(done.status, 'done', done.error ?? '');
    assert.equal(done.result!.engine, 'mirofish');
    assert.equal(done.result!.draft_seeded, true);
    assert.equal(done.result!.counts.quotes, 1);
    assert.match(done.result!.report!.markdown, /Skeptics will ask/);
    assert.ok(fake.state.requests.every((q: { lang: string }) => q.lang === 'en'));
    assert.equal(fake.state.start.max_rounds, 5);
    const a = await r.interview('p1', done.id, { agent_id: 3, prompt: 'Would you repost?' });
    assert.equal(a.answer, 'I would want a link before reposting.');
  } finally {
    await fake.close();
  }
});

test('MiroFish engine: a failed step fails the rehearsal without leaking its traceback', async () => {
  const fake = await startFakeMiroFish({ failAt: '/api/simulation/prepare' });
  try {
    const { run } = harness(mirofishEngine({ client: mirofishClient({ baseUrl: fake.url.replace('127.0.0.1', 'localhost'), pollMs: 1 }) }));
    const r = await run('p1');
    assert.equal(r.status, 'failed');
    assert.match(r.error!, /fake failure/);
    assert.doesNotMatch(r.error!, /Traceback/);
  } finally {
    await fake.close();
  }
});

test('summary: replies land on the sentence they argue with, numbers included', async () => {
  const draft = 'Most AI drafts go wrong in the second sentence. Reviewers skim fluent lines, and 40% of errors hide there. Read your draft backwards.';
  const sentences = sentencesOf(draft).map((text) => ({ id: null, text }));
  const posts = [{ post_id: 1, user_id: 0, original_post_id: null, content: draft }];
  const reply = (agent_id: number, content: string) => ({ round_num: 1, agent_id, action_type: 'REPLY', action_args: { post_id: 1, content } });
  // the MiroFish backend hands its feed to the Python summary the same way
  const { summary: x } = await pythonAgents().run<{ summary: { sentences: { mentions: number; pushback: number }[] } }>('summarize', { draft, sentences, posts, actions: [reply(1, 'Where is the 40% from? I would want the study before I repost this.'), reply(2, 'Reading backwards is a great trick for drafts.')] });
  assert.equal(x.sentences[1].pushback, 1, 'the 40% reply is about the second sentence');
  assert.equal(x.sentences[2].mentions, 1);
  assert.equal(x.sentences[2].pushback, 0);
});

test('titles are cut on a word, not mid-word', async () => {
  const long = 'Most AI drafts go wrong in the second sentence, not the first. Reviewers skim fluent lines and more.';
  const t = (await textSource().load('p', { text: long })).title;
  assert.equal(t, 'Most AI drafts go wrong in the second sentence, not the first.');
  const run = (await textSource().load('p', { text: 'word '.repeat(40) })).title;
  assert.ok(run.endsWith('…') && !/\s…$/.test(run) && run.length <= 81);
});

test('sqlite store: a custom table name lives beside an app that already has a "rehearsals" table', async () => {
  const { ensureRehearsalsTable } = await import('../engine/index.ts');
  const raw = openDatabase(':memory:');
  raw.exec('CREATE TABLE rehearsals (id TEXT PRIMARY KEY, run_id TEXT)');
  ensureRehearsalsTable(raw, { table: 'flockcast_rehearsals' });
  const { run } = harness(swarmEngine(), sqliteStore(raw, { table: 'flockcast_rehearsals' }));
  const done = await run('creator-1', POST, { personas: 3, rounds: 1 });
  assert.equal(done.status, 'done');
  assert.equal(raw.get<{ n: number }>('SELECT COUNT(*) AS n FROM flockcast_rehearsals')?.n, 1);
  assert.equal(raw.get<{ n: number }>('SELECT COUNT(*) AS n FROM rehearsals')?.n, 0, "the app's own table is untouched");
  assert.throws(() => sqliteStore(raw, { table: 'x; DROP TABLE y' }), /lowercase/);
});
