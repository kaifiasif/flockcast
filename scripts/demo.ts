/**
 * Try Flockcast with no model key: starts a local stand-in model (canned replies, not a real model)
 * and the server pointed at it, on a throwaway database.
 *
 *   npm run demo    # then open http://localhost:4180 and create the first account
 */
import { startFakeModel } from '../test/fake-model.ts';

const MODEL_PORT = 4199;
await startFakeModel(MODEL_PORT);
Object.assign(process.env, {
  REHEARSAL_DB: process.env.REHEARSAL_DB ?? 'data/demo.db',
  REHEARSAL_LLM_PROVIDER: 'custom',
  REHEARSAL_LLM_BASE_URL: `http://localhost:${MODEL_PORT}/v1`,
  REHEARSAL_LLM_API_KEY: 'demo',
  REHEARSAL_LLM_MODEL: 'demo-model',
  // canned findings, so the launch advisor works offline too; set ADVISOR_SOURCES=hackernews,reddit to search for real
  ADVISOR_SOURCES: process.env.ADVISOR_SOURCES ?? 'sample',
});
console.log(`demo: stand-in model on http://localhost:${MODEL_PORT}/v1 (canned replies), database ${process.env.REHEARSAL_DB}`);
await import('../src/main.ts');
