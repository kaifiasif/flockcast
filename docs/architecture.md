# How Flockcast fits together

```
web/ (React app, built into public/)
   │  cookie session, same origin
   ▼
src/  Hono server ──────────── /api/v1  ◀── other apps, Bearer flk_ key
   │  accounts, projects, keys, rate limits, headers
   ▼
engine/  createRehearsals({ store, engine, sources }) · createAdvisor({ store, agents, sources })
   ├─ sources   textSource · yours (examples/custom-source, examples/creator-os)
   ├─ stores    sqliteStore · memoryStore · yours
   └─ engines   swarmEngine(agents) · mirofishEngine(client) ──▶ MiroFish (AGPL, separate process)
                   │  one short-lived process per job: JSON in on stdin, JSON lines out
                   ▼
agents/flockcast_agents  (Python 3.10+, standard library only)
   ├─ swarm/     the rehearsal crowd: personas, feed rounds, report, interviews
   └─ advisor/   the launch crew: search, market, buyers, pricing, plan
                   │
                   ▼
                OpenAI-compatible model (Groq by default; none = offline estimate)
```

## agents/

Every agent is Python. Node never calls a model itself: for each job it starts `python3 -m flockcast_agents <rehearse|interview|advise|summarize>`, writes the job to stdin and reads progress (`{"type":"stage"}`) and the answer (`{"type":"result"}` or `{"type":"error"}`) back as JSON lines (`engine/agents.ts`). The child gets only the model settings it needs, opens no port, and is killed past its time limit. Storage, scopes, caps and accounts stay in Node.

- `llm.py`: JSON chat calls against any OpenAI-compatible endpoint, retries on 429 and 5xx, one retry on a bad shape, URL checks, an explicit user-agent.
- `swarm/`: `personas.py` casts followers from the audience segments and past posts, `simulate.py` runs the rounds (each follower sees a ranked feed and decides to like, repost, reply or scroll on), `report.py` writes the summary and answers follower questions, `engine.py` ties them together. With no model it falls back to a seeded rule-based crowd.
- `summarize.py`: turns replies into numbers, and maps each pushback reply to the sentence it is about (word overlap, plus repeated numbers). The MiroFish engine uses it too.
- `advisor/`: Bramble the Scout (`search.py`, `research.py`), Professor Quill (`research.py`), Mystic Mira (`buyers.py`), Lord Ledger (`pricing.py`) and Captain Compass (`planner.py`), run in order by `pipeline.py`.
- `jsnum.py`: JavaScript number behaviour (32-bit multiply, `Math.round`, `toFixed`), so results match the TypeScript engine they replaced to the digit.

## engine/

The part other apps reuse. It knows nothing about accounts or HTTP; every call takes a **scope** (here, a project id) and never reads or writes outside it.

- `core.ts`: `createRehearsals`. Starts a rehearsal (checks the source's gate, the daily cap, and returns the last finished run when the text and settings are unchanged), runs it in the background, records progress, answers follower questions, and marks runs interrupted by a restart as failed.
- `agents.ts`: `pythonAgents({ llm, python })`, the bridge to the Python agents.
- `swarm/`: the built-in audience's adapter: hands the post, settings and platform to the Python crowd.
- `advisor/`: `createAdvisor`, its store, and the agents' names; the work is done by the Python launch crew.
- `platforms.ts`: per-platform wording (reply, repost, quote; limits) for X, LinkedIn, Threads, Bluesky, Reddit and a generic feed.
- `llm.ts`: provider presets, `llmFromEnv` and URL checks. The calls are made in Python.
- `mirofish/`: an HTTP client and an engine that maps MiroFish's simulation onto the same result shape.
- `sources/`, `stores/`: the built-in adapters.

## src/

The standalone server: `node:sqlite` with numbered migrations (`src/db/migrations`), accounts with scrypt passwords, sessions and optional TOTP (`modules/auth`), projects and their API keys (`modules/projects`), rehearsal routes for the app and for `/api/v1` (`modules/rehearsals`), and middleware for same-origin checks, rate limits, body size and security headers (`http/middleware`). Repositories are built per signed-in user, so a query cannot forget the owner. `context.ts` wires it all; `main.ts` starts it.

## web/

React 19, Tailwind v4, shadcn components restyled to the Charm design language, TanStack Query, and Hono's typed client against the server's own route types. Hash routes: landing, log in, sign up, projects, a project (rehearsals, setup, keys), compose, a rehearsal, account. `components/brand/` holds the logo and Pip, the mascot; `scripts/stickers.ts` writes the sticker SVGs.

## Data

One SQLite file. Tables: `users`, `sessions`, `projects`, `api_keys`, `rehearsals` (the engine's table, created from `rehearsalsSql()`). Drafts and results stay in it; nothing is sent anywhere except to the model provider you configure.

## Tests

`test/engine.test.ts` covers the engine with the Python agents against a stand-in model served over HTTP (`test/fake-model.ts`, which also powers `npm run demo`), including retries, interviews, isolation, caps, both stores and the example Creator OS source. `agents/tests` (`npm run test:py`) covers the Python side on its own, including golden results recorded from the old TypeScript engine. `test/api.test.ts` drives the server: accounts, 2-step codes, projects, keys, cross-account access on every endpoint, CSRF, rate limits and headers.
