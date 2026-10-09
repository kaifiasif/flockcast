/**
 * Option A: Creator OS embeds the engine as a library, reading drafts from its own database.
 *
 * Copy `engine/` into Creator OS (or install this package) and wire it once at boot. The rehearsals
 * live in Creator OS's own SQLite file, in a table named so it cannot clash with Creator OS's
 * existing "rehearsals" table. The scope is the Creator OS user id, so one creator never sees
 * another's rehearsals, and the source keeps rehearsal closed until the creator decides on a draft.
 */
import {
  createRehearsals,
  creatorOsSource,
  ensureRehearsalsTable,
  llmFromEnv,
  sqliteStore,
  swarmEngine,
  textSource,
  type SqlDb,
} from '../../engine/index.ts';

export function creatorOsRehearsals(db: SqlDb & { exec(sql: string): void }, env: NodeJS.ProcessEnv = process.env) {
  const table = 'flockcast_rehearsals';
  ensureRehearsalsTable(db, { table });
  return createRehearsals({
    store: sqliteStore(db, { table }),
    // REHEARSAL_LLM_* settings, or Creator OS's own LLM_API_KEY: one free Groq key covers both apps
    engine: swarmEngine({ llm: llmFromEnv(env, { userAgent: 'creator-os' }) }),
    sources: [creatorOsSource(db), textSource()],
    defaults: { platform: 'x', handle: 'the author' },
  });
}

/*
 * In a Creator OS route, after the decision is recorded:
 *
 *   const rehearsals = creatorOsRehearsals(db);
 *   const r = await rehearsals.start(session.user.id, { source: 'creator-os', ref: { run_id: runId } });
 *   // later
 *   rehearsals.get(session.user.id, r.id);
 *   await rehearsals.interview(session.user.id, r.id, { agent_id: 3, prompt: 'Why did you reply?' });
 *
 * start() answers 409 GATE_CLOSED until the run has a decision, and 404 for someone else's run.
 */
