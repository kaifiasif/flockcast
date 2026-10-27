# Using Flockcast from another app

There are two ways in. Pick by where your text lives.

| | HTTP API | Library |
|---|---|---|
| You run | A Flockcast server | Nothing extra; the engine runs inside your app |
| Your app needs | A project API key | `engine/` (no dependencies beyond Node 22.18) |
| Text comes from | The request body | Your own database, through a source adapter |
| Results live in | Flockcast's database | Your database, through a store adapter |
| Good for | Scripts, CI, apps in any language, a quick start | Apps that want rehearsal inside their own UI and data model |

An AI assistant can also use a Flockcast server through the MCP server in `mcp/` (section 3), which wraps the HTTP API.

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
| `POST /api/v1/comparisons` | Compares two or three drafts on one crowd. Body: `drafts` (`[{ text, title? }]`), `platform`, `personas`, `rounds`, `audience`, `critic`. Answers 202 with `group_id` and one rehearsal per draft, labelled `variant` A, B, C |
| `GET /api/v1/comparisons/:id` | The drafts of one comparison, A first |
| `PUT /api/v1/rehearsals/:id/outcome` | Records what really happened after posting: `likes`, `reposts`, `replies`, `quotes`, `impressions` (optional), `note` |
| `GET /api/v1/calibration` | How close this project's rehearsals came to the real numbers: average reaction-mix match, per-post detail, and how often the crowd's pick won |
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

### Research studies

Focus groups, message tests and crisis rehearsals need the Enterprise plan when plans are on (403 `PLAN_REQUIRED` otherwise). Each project starts up to `STUDIES_PER_PROJECT_PER_DAY` a day.

| Endpoint | Does |
|---|---|
| `POST /api/v1/studies` | Starts a study and answers 202. Body by `kind`: `focus_group` with `topic`, `material`, `questions` (1 to 5), `segments` (1 to 4 `{ name, about }`), `panelists` (4 to 12); `message_test` with `messages` (2 to 4 `{ label, text }`), `segments` (up to 5), `per_segment` (2 to 10), optional `goal`; `crisis` with `situation`, `statement`, `stakeholders` (`customers`, `press`, `critics`, `employees`, `investors`, `regulators`) and `rounds` (1 or 2) |
| `GET /api/v1/studies?kind=` | Recent studies, newest first, without results |
| `GET /api/v1/studies/:id` | One study, with `status` (`queued`, `preparing`, `running`, `reporting`, `done`, `failed`) and, when done, `result` keyed on `kind` |

The web app uses the same shapes under `/api/projects/:id/studies`, plus `DELETE …/studies/:sid` (not while it runs).

### Brand rules

`PUT /api/projects/:id/brand` with `{ voice, banned: [...], required: [...], notes }` (owner, Studio plan). Empty rules clear them. While set, every finished rehearsal has `result.brand`: `{ ok, issues: [{ rule, level: "risk" | "warn", detail, quote }], voice }`, and each message test version has its own `brand` issues. Banned words match whole words only.

### Teams, sign-off and webhooks

These are app routes under `/api`, used by the web app with a session cookie. A stranger's project answers 404; a member whose role does not allow an action gets 403 `FORBIDDEN`; a plan that lacks a feature gets 403 `PLAN_REQUIRED`.

| Endpoint | Does |
|---|---|
| `GET /api/projects/:id/members` | The owner and members with their roles |
| `POST /api/projects/:id/invites` / `DELETE …/invites/:iid` | Makes a one-time invite link for `editor`, `reviewer` or `viewer` (owner only), or withdraws one |
| `POST /api/invites/accept` | Joins with `{ token }` |
| `PUT` / `DELETE /api/projects/:id/members/:uid` | Changes a role or removes someone (owner; anyone may leave) |
| `POST /api/projects/:id/rehearsals/:rid/approval` | Asks for sign-off on a finished rehearsal, with an optional `note` |
| `POST /api/projects/:id/approvals/:aid/decision` | `{ decision: "approved" \| "changes_requested", comment? }` from a reviewer or the owner, never the person who asked |
| `GET /api/projects/:id/audit`, `/audit/csv` | The audit log |
| `GET /api/projects/:id/usage`, `/export?format=csv\|json` | Usage this month, and the latest 200 rehearsals |
| `GET` / `POST /api/projects/:id/webhooks`, `DELETE …/:hid`, `POST …/:hid/test` | Webhooks; the secret is shown once at creation |

Each webhook delivery is a JSON POST with `{ id, event, created_at, data }` and a header

```
Flockcast-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>" keyed with the secret>
```

Recompute the HMAC over the raw body, compare in constant time, and reject a `t` more than five minutes old. Failed deliveries are retried after 2 and 30 seconds.

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

## 3. MCP server, for AI assistants

`mcp/flockcast_mcp.py` lets Claude Desktop, Claude Code, Cursor or any MCP client rehearse while it writes. It speaks MCP over stdio, needs only Python 3.10+, and calls `/api/v1` with one project key, so the assistant can reach that project and nothing else. Run it on your own machine, next to the assistant.

```json
{
  "mcpServers": {
    "flockcast": {
      "command": "python3",
      "args": ["/path/to/flockcast/mcp/flockcast_mcp.py"],
      "env": { "FLOCKCAST_URL": "https://your-flockcast.example", "FLOCKCAST_KEY": "flk_..." }
    }
  }
}
```

In Claude Code: `claude mcp add flockcast -e FLOCKCAST_URL=... -e FLOCKCAST_KEY=flk_... -- python3 /path/to/flockcast/mcp/flockcast_mcp.py`.

| Tool | Does |
|---|---|
| `rehearse_post` | Rehearses a post and waits for the result (pushback, fixes, checks, persona ids) |
| `ask_follower` | Asks one simulated follower a question (needs a model key on the server) |
| `compare_drafts` | Two or three drafts on one crowd, with `crowd_pick` |
| `record_outcome`, `calibration` | Real numbers after posting, and how close rehearsals have come |
| `focus_group`, `message_test`, `crisis_rehearsal` | The research studies |
| `launch_advice` | The launch crew's research, price and plan |
| `get_rehearsal`, `get_study`, `get_advice` | Read a run by id |

Tools wait up to 150 seconds; a longer run comes back with its id and a note to check it with the matching `get_` tool. Plans, caps and roles apply exactly as they do for the HTTP API.

## Worked example: Creator OS

`examples/creator-os/` plugs Flockcast into Creator OS. It is an example, not a dependency: Flockcast's engine and server never import it.

**As a library** (`embed.ts` with `source.ts`): `creatorOsSource(db)` reads a run's final text, its sentence ids and the creator's archive from Creator OS's own tables, scoped to the Creator OS user id. It keeps rehearsal closed until the creator has decided on the draft (accept or edit; a rejected draft stays closed), so simulated reactions never sway the decision Creator OS's study measures. `creatorOsSource(db, { beforeDecision: true })` lifts that for demos. Creator OS already has a table called `rehearsals`, so the engine uses `flockcast_rehearsals` there.

**Over HTTP** (`http.ts`): Creator OS uses the generic client like any other app, with `FLOCKCAST_URL` and `FLOCKCAST_KEY` kept server side, and only calls it after a decision.

The model key can be a shared `LLM_API_KEY`, so one free Groq key covers both apps.
