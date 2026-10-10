# Using Flockcast from another app

There are two ways in. Pick by where your text lives.

| | HTTP API | Library |
|---|---|---|
| You run | A Flockcast server | Nothing extra; the engine runs inside your app |
| Your app needs | A project API key | `engine/` (no dependencies beyond Node 22.18) |
| Text comes from | The request body | Your own database, through a source adapter |
| Results live in | Flockcast's database | Your database, through a store adapter |
| Good for | Scripts, CI, apps in any language, a quick start | Apps that want rehearsal inside their own UI and data model |

Flockcast does not depend on any app. Any app can use either way in; `examples/creator-os/` shows both for one real app.

## 1. HTTP API

Create a project in the Flockcast app (platform, handle, audience, past posts), open **API keys**, and make a key. It is shown once.

```bash
export FLOCKCAST=https://your-flockcast.example
export FLOCKCAST_KEY=flk_...

# start (or get back the finished) rehearsal of a draft
curl -X POST $FLOCKCAST/api/v1/rehearsals \
  -H "Authorization: Bearer $FLOCKCAST_KEY" -H "Content-Type: application/json" \
  -d '{"text": "Your draft.\n---\nSecond part of the thread.", "subject": "draft-42", "title": "Launch thread"}'

# read it until status is "done" or "failed"
curl $FLOCKCAST/api/v1/rehearsals/<id> -H "Authorization: Bearer $FLOCKCAST_KEY"

# ask one of the simulated followers a question
curl -X POST $FLOCKCAST/api/v1/rehearsals/<id>/interview \
  -H "Authorization: Bearer $FLOCKCAST_KEY" -H "Content-Type: application/json" \
  -d '{"agent_id": 3, "prompt": "What would make you repost this?"}'
```

| Endpoint | Does |
|---|---|
| `GET /api/v1/project` | The project this key belongs to |
| `POST /api/v1/rehearsals` | Starts a rehearsal. Body: `text` (required; `---` lines split a thread), `subject`, `title`, `platform`, `personas`, `rounds`, `audience`, `critic` (default true: seat a harsh critic), `mode` (`crowd` or `quick`), `force`. Answers 202 with the rehearsal |
| `GET /api/v1/rehearsals?subject=draft-42&limit=20` | Recent rehearsals, newest first, optionally for one subject |
| `GET /api/v1/rehearsals/:id` | One rehearsal, with `status`, `progress` (0 to 100) and, when done, `result` |
| `POST /api/v1/rehearsals/:id/interview` | Asks follower `agent_id` a question. 409 when the rehearsal ran offline |

Behaviour worth knowing:

- **Studio notes.** A finished result also carries `mode`, `critic` (the critic's persona id), `crowd` (friendliness and a warning when the crowd agreed with everything), `checks` (platform rules), `ai_check` (sentences that read as AI-written), `fixes` (why a sentence drew pushback, who said what, and a rewrite when a model is set) and `reply_prep` (likely first replies with drafted answers). Older rehearsals and MiroFish runs leave them out, so treat them as optional.
- **Same text, same answer.** Starting a rehearsal whose text and settings match the last finished one for that subject returns it without spending model calls. Pass `"force": true` to run a new crowd anyway.
- **Subjects.** `subject` is your id for the draft. Reruns of one subject form one history and share the daily cap (10 a day by default). Without it, the text itself is the subject.
- **Errors** are always `{ "error": { "code", "message" } }`: 400 `VALIDATION_FAILED`, 401 bad key, 404 not found or not yours, 409 not ready or no interviews offline, 429 rate or spend cap (with `Retry-After`), 502 the model failed.
- **Keys** work for one project. Keep them on your server; never ship one to a browser.

Ready clients, copy one into your app: `examples/http-client/flockcast-client.ts` (TypeScript, fetch only) and `examples/http-client/flockcast_client.py` (Python, standard library only), each with `rehearse`, `wait`, `ask`, `advise` and `wait_advice`/`waitAdvice`. Any other language needs only an HTTP client: the API is plain JSON with a Bearer header.

### Launch advice

| Endpoint | Does |
|---|---|
| `POST /api/v1/advice` | Starts a launch advisor run. Body: `product` and `pitch` (at least 20 characters) required; `audience`, `price_idea`, `competitors` (up to 8 names), `billing` (`subscription` or `one_time`), `currency` (`USD`, `EUR`, `GBP`, `INR`), `buyers` (5 to 30). Answers 202 |
| `GET /api/v1/advice` | Recent runs, newest first, without their reports |
| `GET /api/v1/advice/:id` | One run, with `status` (`queued`, `researching`, `simulating`, `deciding`, `done`, `failed`) and, when done, `result`: `findings`, `market`, `buyers`, `reception`, `pricing` and `plan` |

As a library: `createAdvisor({ store: sqliteAdviceStore(db), agents: pythonAgents({ llm: llmFromEnv() }), sources: searchSourcesFromEnv() })`, then `advisor.start(scope, { product, pitch })`. The table is `ADVICE_SQL`.

## 2. Library

```ts
import { createRehearsals, llmFromEnv, pythonAgents, sqliteStore, swarmEngine, textSource } from './flockcast/engine/index.ts'; // copy engine/ and agents/ into your app, or a git dependency

const rehearsals = createRehearsals({
  store: sqliteStore(db, { table: 'flockcast_rehearsals' }),
  engine: swarmEngine({ agents: pythonAgents({ llm: llmFromEnv(process.env) }) }), // null key: offline estimate
  sources: [textSource()],
});

const r = await rehearsals.start(workspaceId, { ref: { text: draft, subject: `draft:${id}` }, settings: { platform: 'linkedin' } });
rehearsals.get(workspaceId, r.id);
await rehearsals.interview(workspaceId, r.id, { agent_id: 2, prompt: 'Which line lost you?' });
```

The first argument of every call is the **scope**: whatever owns the rehearsals in your app (a user, a workspace, a project). The engine never reads or writes outside it.

Everything that varies between apps is an adapter:

| Adapter | Built in | Write your own when |
|---|---|---|
| **Source**: where the text comes from | `textSource()` (text in the request); your own, e.g. `examples/custom-source/posts-table.ts` | Your drafts live in your database and you want ownership checks or a gate |
| **Store**: where rehearsals are kept | `sqliteStore(db, { table })`, `memoryStore()` | You use Postgres, Redis or an ORM |
| **Engine**: who plays the audience | `swarmEngine({ agents })`, `mirofishEngine({ client, agents })` | You have your own simulator |
| **Model**: which LLM | `llmFromEnv(env)`, or `{ provider, model, baseUrl, apiKey }` passed to `pythonAgents({ llm })` | Your provider is not OpenAI-compatible |

### Settings

`settings` on `start()` (and `defaults` on `createRehearsals`):

| Setting | Default | Range |
|---|---|---|
| `platform` | `x` | `x`, `linkedin`, `threads`, `bluesky`, `reddit`, `generic` |
| `handle` | `the author` | How the author appears to the crowd |
| `audience` | null (peers, skeptics, newcomers) | One segment per line: `Founders: early-stage, short on time` |
| `personas` | 12 | 2 to 30 followers |
| `rounds` | 10 | 1 to 40 |

### Model providers

`llmFromEnv` reads `REHEARSAL_LLM_PROVIDER`, `REHEARSAL_LLM_API_KEY`, `REHEARSAL_LLM_MODEL` and `REHEARSAL_LLM_BASE_URL`, and falls back to `LLM_API_KEY` and `LLM_BASE_URL` so an app that already has one key can share it.

| Provider | Default model | Key |
|---|---|---|
| `groq` (default) | `openai/gpt-oss-120b` | Free at console.groq.com |
| `gemini` | `gemini-2.5-flash` | Free at aistudio.google.com |
| `openrouter` | `openai/gpt-oss-120b:free` | Free models at openrouter.ai |
| `ollama` | `qwen2.5:7b` | None; runs on your machine |
| `openai` | `gpt-5-mini` | Paid |
| `custom` | set `REHEARSAL_LLM_MODEL` | Any OpenAI-compatible URL |

No key means every rehearsal is an offline estimate: a seeded, rule-based crowd that is labelled as such everywhere and cannot answer questions.

### Writing a source

A source answers one question: for this scope and reference, what text should the crowd read? `examples/custom-source/posts-table.ts` is a complete one. The rules:

1. Only return text the scope owns. Anything else throws `RehearsalError(404, 'NOT_FOUND', ...)`, so ids cannot be probed.
2. Return a stable `subject` per draft, so reruns form one history.
3. Return `gate: { open: false, reason }` when the text should not be rehearsed yet. The reason is shown to people, so make it something they can act on.
4. Optionally return `sentences` with your own ids, so results map back to your rows, and `examples` (past posts) to cast followers who would follow this author.

```ts
const mySource: Source = {
  name: 'posts',
  load(scope, ref) {
    const post = findPost(scope, ref.post_id);          // owner-checked
    if (!post) throw new RehearsalError(404, 'NOT_FOUND', 'Post not found.');
    return { subject: `post:${post.id}`, title: post.title, input: { posts: [post.body] } };
  },
};
createRehearsals({ store, engine, sources: [mySource, textSource()] });
await rehearsals.start(scope, { source: 'posts', ref: { post_id: 'p_123' } });
```

### Writing a store

Implement `Store` from `engine/types.ts`: `insert`, `update(scope, id, patch)`, `get`, `latest`, `list`, `countSince`, `remove`, `failStale`. Every method except `insert` and `failStale` takes the scope and must filter by it. `engine/stores/memory.ts` is the shortest reference (about 40 lines). For SQLite, copy `rehearsalsSql('your_table')` into a migration, or call `ensureRehearsalsTable(db, { table })` at boot.

Call `rehearsals.recover()` once at boot: rehearsals left running by a crash are marked failed with a message, instead of spinning forever.

## Worked example: Creator OS

`examples/creator-os/` plugs Flockcast into Creator OS. It is an example, not a dependency: Flockcast's engine and server never import it.

**As a library** (`embed.ts` with `source.ts`): `creatorOsSource(db)` reads a run's final text, its sentence ids and the creator's archive from Creator OS's own tables, scoped to the Creator OS user id. It keeps rehearsal closed until the creator has decided on the draft (accept or edit; a rejected draft stays closed), so simulated reactions never sway the decision Creator OS's study measures. `creatorOsSource(db, { beforeDecision: true })` lifts that for demos. Creator OS already has a table called `rehearsals`, so the engine uses `flockcast_rehearsals` there.

**Over HTTP** (`http.ts`): Creator OS uses the generic client like any other app, with `FLOCKCAST_URL` and `FLOCKCAST_KEY` kept server side, and only calls it after a decision.

The model key can be a shared `LLM_API_KEY`, so one free Groq key covers both apps.
