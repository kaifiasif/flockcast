# Working on Flockcast

Instructions for AI coding assistants (Claude Code, ChatGPT/Codex, Cursor, Copilot and others) and for people new to the code. Read this before changing anything. `CLAUDE.md` and `.cursor/rules/` point here, so this file is the one to keep up to date.

## What this is

Flockcast rehearses a social post with a simulated audience before it is published. Three surfaces share one codebase:

- `engine/`: the reusable core. `createRehearsals({ store, engine, sources })`. No HTTP, no accounts. Every call takes a **scope** and never reads or writes outside it.
- `agents/flockcast_agents/`: **all agent code, in Python** (3.10+, standard library only): the rehearsal crowd (`swarm/`) and the launch crew (`advisor/`). Node starts one process per job through `engine/agents.ts`; Python never touches the database.
- `src/`: the standalone server (Hono, zod, `node:sqlite`). Accounts, projects, API keys, the app API and `/api/v1`.
- `web/`: the React 19 app (Tailwind v4, shadcn/Radix, TanStack Query, Hono RPC client), built into `public/`.

`docs/architecture.md`, `docs/integration.md` and `docs/security.md` explain each in depth.

## Commands

```bash
npm install && npm run build:web   # once
npm run demo                        # app on :4180 with a stand-in model; no key needed
npm test                            # node:test tests (they run the Python agents)
npm run test:py                     # unittest tests for agents/
npm run check                       # typecheck server + web, then both test suites: run before every commit
```

Node 22.18 or newer runs the TypeScript directly; there is no server build step. Imports use the `.ts` extension. Web changes must ship with a rebuilt `public/` (`cd web && npm run build`), because the Dockerfile serves it as committed.

## Rules that keep it correct

**Isolation is enforced in the data layer, not the UI.**
- Project and key SQL lives only in `src/db/repositories/`, and those repositories are built for one user (`app.forUser(userId)`). Never query those tables from a route.
- Rehearsals are reached through `app.rehearsals` with the project id as scope, after the project has been loaded through the owner's repository.
- Someone else's id must answer **404**, never 403. Add a case to the BOLA test in `test/api.test.ts` for every new endpoint.

**Errors have stable codes.** Throw `AppError` with an `ErrorCode` from `src/core/errors.ts` (or `RehearsalError` inside `engine/`). The response shape is always `{ error: { code, message } }`. Never leak stack traces, SQL or model output in a 5xx.

**Validate at the edge.** Every route validates params, query and body with zod (`validate(...)`). Cap lengths. Never spread a request body into a database write.

**Secrets stay on the server.** Model keys come from env only, are never returned by `/api/config`, never logged (the logger redacts key-like fields; keep names like `api_key`, `token`, `secret`), and never reach the web bundle. API keys and sessions are stored as SHA-256 hashes.

**Free by default.** The default model provider is a free tier (Groq). No feature may require a paid service; with no key the engine must still work as a clearly labelled offline estimate.

**Agents are Python.** Prompts, model calls, simulation, research, pricing and planning live in `agents/flockcast_agents`; never add agent logic to TypeScript. Keep Python to the standard library, send an explicit user-agent on every outbound request, and validate every model answer before using it. Node owns storage, scopes, caps and HTTP.

**MiroFish is AGPL.** It runs only as a separate process behind `engine/mirofish/client.ts`. Never copy code from MiroFish into this repository.

**Simulated, not predicted.** User-facing copy never claims a forecast. Results are a rehearsal; offline estimates say so.

## Style

- TypeScript strict, ES modules, `erasableSyntaxOnly` (no enums, no namespaces, no parameter properties). Use `as const` objects for enums.
- Small modules with one job. A route file wires; logic goes in the engine or a service; SQL goes in a repository. A file past ~250 lines is a sign to split it.
- Name things for what users see ("rehearsal", "follower", "pushback"), not how they are built.
- Comments explain why, not what. Match the surrounding comment density.
- No new runtime dependency without a clear reason; the server has four.
- Database changes are a new numbered file in `src/db/migrations/`; never edit a shipped migration. Use `STRICT` tables, `CHECK` constraints and foreign keys.

## Web app

See `web/CONVENTIONS.md`. In short: types come from the server via `@/api/types`; components fetch only through a feature's `api.ts` hooks; build from `@/components/ui`; Charm design tokens in `web/src/index.css` (coral brand, warm stone, light theme only); sentence-case copy, buttons say what they do; every icon-only button has an `aria-label`; layouts work at 375px; motion respects `prefers-reduced-motion`.

## Tests

`node:test` with real behaviour, not mocks of the code under test. `test/helpers.ts` builds an app on an in-memory database; `test/fake-model.ts` serves a stand-in OpenAI-compatible model over HTTP that the Python agents call. Python logic gets a `unittest` test in `agents/tests`. A bug fix comes with a test that fails before the fix. Never skip or delete a failing test to get green.

## Before you finish

1. `npm run check` passes.
2. New endpoints have validation, an owner check, a BOLA test and a stable error code.
3. If the web app changed: `cd web && npm run build`, and look at the screen at desktop and 375px widths.
4. Docs updated where behaviour changed (`README.md`, `docs/`, `.env.example`).
