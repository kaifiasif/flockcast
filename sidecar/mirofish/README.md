# Optional engine: MiroFish

Flockcast's own engine (the "swarm") needs nothing but a model key. If you want MiroFish's
knowledge-graph simulation instead, run MiroFish as a separate service and point Flockcast at it.

**Licence boundary.** MiroFish is AGPL-3.0. Flockcast contains no MiroFish code: it only calls
MiroFish's HTTP API (`engine/mirofish/client.ts`). Keep it that way. Run the upstream image
unmodified in its own container; if you modify MiroFish and offer it to others over a network, the
AGPL asks you to publish those modifications.

```bash
cd sidecar/mirofish
cp .env.example .env      # free Gemini key + free Zep Cloud key
docker compose up -d      # API on http://localhost:5001
```

Then start Flockcast with:

```bash
REHEARSAL_ENGINE=mirofish MIROFISH_URL=http://localhost:5001 npm start
```

What changes for people using Flockcast: rehearsals take minutes rather than seconds, the account
shows "MiroFish" as the engine, and the results page says how closely MiroFish's seeded post matched
your draft (MiroFish may paraphrase it). Asking followers questions still works.
