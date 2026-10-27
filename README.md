# Flockcast

![Flockcast landing page](docs/screenshots/d-landing.png)

Rehearse a post with a simulated audience before you publish it. Flockcast casts a crowd of followers that fits your account, lets them read your draft over a few rounds, and shows you which sentence they pushed back on, how they replied, and why. You can then ask any follower a question.

It comes three ways from one codebase:

- **An app**: accounts, projects (one per account you post from), rehearsals, results, follower interviews, API keys. Open `http://localhost:4180`.
- **An HTTP API** for other apps, with a key per project (`/api/v1`).
- **An engine** (`engine/`) you can embed in your own Node app, with adapters for where text comes from, where results are kept, and which model plays the audience.

Simulated audiences are a rehearsal, not a forecast. The app says so wherever it shows results.

## Studio crew

After the crowd reads your post, a crew of small agents helps you fix it. Each runs without a model too, more simply.

- **Sable the Sniffer** flags sentences that read as AI-written and says what gives each away.
- **Editor Ember** explains why readers pushed back on a sentence, quotes who said what, and (with a model) writes a rewrite. Missing sources become `[source]`; it never invents facts.
- **Rook the Contrarian** sits in every crowd as a harsh critic (turn it off with `"critic": false`). If the crowd still agrees with everything, the results warn that a friendly crowd proves little.
- **Echo the Herald** picks the replies you are likely to get first and drafts your answers (model only).
- **Wren** gives a quick read in one model call (`"mode": "quick"`) when you do not need the full feed simulation.

Every rehearsal also checks the platform's rules: length, links, hashtags, the LinkedIn fold, engagement bait, all caps. The compose screen offers hard-to-reach crowds (enterprise buyers, investors, developers, journalists, Gen Z, regulated industries) as starting points.

## Compare drafts and check against reality

- **Compare drafts**: rehearse two or three versions of a post on one crowd. Draft A casts it; the same people, with the same luck, read the others, so differences come from the text. The page marks the crowd's pick.
- **After you post**: enter the real likes, reposts, replies and quotes on a rehearsal. Flockcast compares how the reactions split (not how many, since a dozen simulated people cannot predict reach) and keeps score per project, including how often the crowd's pick in a comparison did best for real.

## Teams, sign-off and plans

- **Teams.** Invite people to a project with a one-time link (valid 7 days) as an editor (rehearses and asks for sign-off), reviewer (approves or asks for changes) or viewer (reads only). Only the owner changes the setup, keys, webhooks and members.
- **Sign-off.** An editor asks for approval on a finished rehearsal; a reviewer or the owner approves it or asks for changes. Nobody approves their own request.
- **Webhooks.** Up to five https endpoints per project get `rehearsal.finished`, `approval.requested` and `approval.decided`, signed with HMAC-SHA256 (see `docs/integration.md`).
- **Usage, export and audit log.** Rehearsals this month, a CSV or JSON export, and a log of who started, approved, exported or changed what.
- **Plans.** Free, Creator ($19), Studio ($49) and Enterprise each unlock more. Plans are off by default, so a self-hosted server has every feature. Set `FLOCKCAST_PLANS=on` to enforce them and change someone's plan with `npm run plan -- you@example.com studio`.

## Research and brand rules

- **Focus group** (Moderator Maple): a panel recruited from the groups you name, including hard-to-reach ones, answers up to five questions about your material. You get the transcript, warmth by group, themes with quotes, where they agreed and split, and what to change.
- **Message test** (Tally the Pollster): two to four versions rated by each group for appeal, clarity and believability. Every group counts the same, so a large group cannot drown out a small one, and a split between groups is called out.
- **Crisis rehearsal** (Juniper the Steady): customers, press, critics, employees, investors or regulators react to a holding statement, round by round. You get heat per group, the line each group will quote against you, checks for apology, ownership, deflection and next steps, and a revised statement that cannot add facts you did not give (invented numbers become `[fact]`).
- **Brand rules** (Ivy the Guardian, Studio plan): a project's voice, banned words and required lines. Every rehearsal and message test is checked against them.

Studies are a rehearsal of the conversation, not a survey or a forecast. Without a model key they run as a labelled offline estimate.

## Launch advisor

Each project also has a **Launch advisor** for the product you are about to launch. Describe it in a few sentences and a crew of five agents does the rest, written for someone who has never priced or launched anything:

| Agent | Job |
|---|---|
| Bramble the Scout | Searches Hacker News and Reddit (no key needed) and, with a free `TAVILY_API_KEY`, the open web for people talking about the problem |
| Professor Quill | Reads what was found, names the competitors and copies the exact words people used, each linked to its page |
| Mystic Mira | Asks a crowd of simulated buyers how much they like it, what puts them off and what they would pay |
| Lord Ledger | Turns the buyers' four price answers (Van Westendorp) into an acceptable range and the plan prices, by arithmetic rather than by the model |
| Captain Compass | Makes the call (launch, launch after changes, or rethink) and writes the features to build first, the launch steps and a launch post you can rehearse |

![The launch crew](docs/screenshots/advisor-crew.png)

A run is four model calls. Quotes that are not word for word in a page found are dropped. Without a model key the crew still searches and shows what it found, labelled as research only. Each project gets 5 runs a day (`ADVICE_PER_PROJECT_PER_DAY`).

![A launch advice report](docs/screenshots/advisor-report.png)

## Run it

Needs Node 22.18 or newer and Python 3.10 or newer. The server runs its TypeScript directly; the agents are Python with no packages to install; only the web app has a build step.

```bash
npm install
npm run build:web     # builds the app into public/
cp .env.example .env  # optional; add a free model key here
npm start             # http://localhost:4180, then create your account
```

Without a model key every rehearsal is an **offline estimate**: a seeded, rule-based crowd, labelled as such, that cannot answer questions. Add a free key (Groq is the default) for real simulated replies.

Other commands:

```bash
npm run demo          # the app on :4180 with a built-in stand-in model, so every screen works with no key
npm test              # 38 tests: engine, advisor, adapters, accounts, API, isolation between accounts, security checks
npm run test:py       # 23 tests for the Python agents
npm run check         # typecheck server and web, then the tests
npm run dev           # server with reload; `npm run dev:web` for the web app with hot reload on :5173
npm run stickers      # regenerate the mascot sticker files
```

## Settings

All optional; see `.env.example`.

| Variable | Default | What it does |
|---|---|---|
| `PORT` / `HOST` | `4180` / `127.0.0.1` | Where the server listens |
| `REHEARSAL_DB` | `data/rehearsal.db` | The SQLite file |
| `NODE_ENV` | | `production` makes cookies `Secure` with the `__Host-` prefix; needs HTTPS |
| `TRUST_PROXY` | off | Read the visitor IP from `X-Forwarded-For` behind Render, Fly or nginx |
| `REHEARSAL_SIGNUP` | `closed` | `closed`: only the first account can sign up. `open`: anyone |
| `REHEARSAL_OWNER_EMAIL` | | On a public server, only this email can create the first account |
| `REHEARSAL_LLM_PROVIDER` | `groq` | `groq`, `gemini`, `openrouter`, `ollama`, `openai`, `custom` |
| `REHEARSAL_LLM_API_KEY` | | Free keys at console.groq.com, aistudio.google.com, openrouter.ai |
| `REHEARSAL_LLM_MODEL` / `_BASE_URL` | per provider | Override the model, or point `custom` at any OpenAI-compatible URL |
| `LLM_API_KEY` / `LLM_BASE_URL` | | Generic shared names, read when the `REHEARSAL_` ones are unset, so a key another app on the host already sets works as is |
| `FLOCKCAST_PYTHON` | `python3` | The Python 3.10+ that runs the agents |
| `REHEARSAL_ENGINE` / `MIROFISH_URL` | `swarm` | `mirofish` uses a MiroFish server you run (see `sidecar/mirofish`) |
| `REHEARSALS_PER_SUBJECT_PER_DAY` | `10` | Spend cap per draft |
| `INTERVIEWS_PER_REHEARSAL` | `25` | Spend cap per rehearsal |
| `STUDIES_PER_PROJECT_PER_DAY` | `10` | Spend cap on focus groups, message tests and crisis rehearsals per project |
| `FLOCKCAST_PLANS` | `off` | `on` enforces Free, Creator, Studio and Enterprise limits per account; `off` gives everyone every feature |
| `WEBHOOKS_ALLOW_PRIVATE` | off | Lets webhooks reach private and local addresses. For testing only |

Per project, in the app: platform (X, LinkedIn, Threads, Bluesky, Reddit or generic), handle, audience segments, past posts (so the crowd is made of people who would follow you), crowd size and rounds.

## Defaults chosen

- Sign-up is closed: the first account owns the server. Open it with `REHEARSAL_SIGNUP=open`.
- Groq is the default model provider because its free tier is enough for daily use; any of the six presets works.
- Every agent is Python (`agents/flockcast_agents`, standard library only); the server starts one short-lived process per job, so nothing extra listens or needs installing beyond `python3`.
- The built-in engine (`swarm`) runs on the same machine as the server. MiroFish is optional and stays a separate AGPL service; no MiroFish code is in this repository.
- The platform is chosen per project, so one server can rehearse X threads and LinkedIn posts side by side.
- Light theme only, following the Charm design language.
- `package.json` is `"private": true`. Remove that when you publish the engine to npm.

## Plug it into any app

Flockcast is standalone: it does not depend on any other app, and any app can use it. See [docs/integration.md](docs/integration.md). In short:

- **Over HTTP, from any language**: make a project and a key in the app, then call `/api/v1` with `Authorization: Bearer flk_...`. Ready clients: `examples/http-client/flockcast-client.ts` (TypeScript) and `examples/http-client/flockcast_client.py` (Python, standard library only). Both cover rehearsals, follower questions and launch advice.
- **From an AI assistant**: `mcp/flockcast_mcp.py` is an MCP server (Python, standard library only) that gives Claude, Cursor and other assistants tools to rehearse posts, compare drafts, run focus groups, message tests and crisis rehearsals, and ask for launch advice, all through one project key.
- **As a library, in a Node app**: `createRehearsals({ store, engine, sources })` and `createAdvisor({ store, llm, search })` with your own adapters. `examples/custom-source/posts-table.ts` is a template for reading drafts from your own database.

`examples/creator-os/` is one worked example of both modes, for Creator OS. Nothing outside that folder knows about it.

## Deploy

- **Docker**: run `npm run build:web` first (the image copies the built `public/`), then `docker build -t flockcast . && docker run -p 4180:4180 -v flockcast-data:/app/data -e REHEARSAL_LLM_API_KEY=... flockcast`. The database lives on the volume.
- **Render**: `render.yaml` is a blueprint for a free web service with a disk. Set `REHEARSAL_LLM_API_KEY` and `REHEARSAL_OWNER_EMAIL` in the dashboard.

Put it behind HTTPS and set `NODE_ENV=production`, `TRUST_PROXY=1` and `REHEARSAL_OWNER_EMAIL` before sharing the URL.

## The mascot

Pip is Flockcast's plush coral bird, drawn as die-cut stickers in nine moods: plain, skeptic, fan, newcomer, lurker, amplifier, analyst, sleepy and oops. The app uses them for followers, empty states and errors. The launch advisor's crew are Pips too: Bramble the Scout (pith helmet and binoculars), Professor Quill (mortarboard and quill), Mystic Mira (turban and crystal ball), Lord Ledger (top hat, monocle and coin) and Captain Compass (captain's hat and compass). The SVG files are in `public_static/stickers/` (and in `stickers/` as SVG and PNG), free to use with Flockcast.

## More

- [docs/architecture.md](docs/architecture.md): how the pieces fit
- [docs/integration.md](docs/integration.md): HTTP API, clients, adapters, worked examples
- [docs/security.md](docs/security.md): each common web risk and how it is handled
- [sidecar/mirofish/README.md](sidecar/mirofish/README.md): running MiroFish beside Flockcast

MIT licensed. See `LICENSE`.
