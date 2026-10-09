# How Flockcast fits together

```
web/ (React app, built into public/)
   │  cookie session, same origin
   ▼
src/  Hono server ──────────── /api/v1  ◀── other apps, Bearer flk_ key
   │  accounts, projects, keys, rate limits, headers
   ▼
engine/  createRehearsals({ store, engine, sources })
   ├─ sources   textSource · creatorOsSource · yours
   ├─ stores    sqliteStore · memoryStore · yours
   └─ engines   swarmEngine(llm) · mirofishEngine(client) ──▶ MiroFish (AGPL, separate process)
                   │
                   ▼
                OpenAI-compatible model (Groq by default; none = offline estimate)
```

## engine/

The part other apps reuse. It knows nothing about accounts or HTTP; every call takes a **scope** (here, a project id) and never reads or writes outside it.

- `core.ts`: `createRehearsals`. Starts a rehearsal (checks the source's gate, the daily cap, and returns the last finished run when the text and settings are unchanged), runs it in the background, records progress, answers follower questions, and marks runs interrupted by a restart as failed.
- `swarm/`: the built-in audience. `personas.ts` casts followers from the audience segments and past posts, `simulate.ts` runs the rounds (each follower sees the post and the replies so far and decides to like, repost, reply or scroll on), `report.ts` writes the summary. With no model it falls back to a seeded rule-based crowd.
- `summarize.ts`: turns replies into numbers, and maps each pushback reply to the sentence it is about (word overlap, plus repeated numbers).
- `platforms.ts`: per-platform wording (reply, repost, quote; limits) for X, LinkedIn, Threads, Bluesky, Reddit and a generic feed.
- `llm.ts`: provider presets, `llmFromEnv`, retries on 429 and bad JSON, URL checks.
- `mirofish/`: an HTTP client and an engine that maps MiroFish's simulation onto the same result shape.
- `sources/`, `stores/`: the built-in adapters.

## src/

The standalone server: `node:sqlite` with numbered migrations (`src/db/migrations`), accounts with scrypt passwords, sessions and optional TOTP (`modules/auth`), projects and their API keys (`modules/projects`), rehearsal routes for the app and for `/api/v1` (`modules/rehearsals`), and middleware for same-origin checks, rate limits, body size and security headers (`http/middleware`). Repositories are built per signed-in user, so a query cannot forget the owner. `context.ts` wires it all; `main.ts` starts it.

## web/

React 19, Tailwind v4, shadcn components restyled to the Charm design language, TanStack Query, and Hono's typed client against the server's own route types. Hash routes: landing, log in, sign up, projects, a project (rehearsals, setup, keys), compose, a rehearsal, account. `components/brand/` holds the logo and Pip, the mascot; `scripts/stickers.ts` writes the sticker SVGs.

## Data

One SQLite file. Tables: `users`, `sessions`, `projects`, `api_keys`, `rehearsals` (the engine's table, created from `rehearsalsSql()`). Drafts and results stay in it; nothing is sent anywhere except to the model provider you configure.

## Tests

`test/engine.test.ts` covers the engine against a stand-in model (`test/fake-model.ts`, which also powers `npm run demo`), including retries, interviews, isolation, caps, both stores and the Creator OS source. `test/api.test.ts` drives the server: accounts, 2-step codes, projects, keys, cross-account access on every endpoint, CSRF, rate limits and headers.
