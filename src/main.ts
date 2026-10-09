/** Boot: parse env, open and migrate the database, pick the engine, serve. */
import { serve } from '@hono/node-server';
import { llmFromEnv, mirofishClient, mirofishEngine, swarmEngine, type Engine } from '../engine/index.ts';
import { createApp } from './app.ts';
import { configFromEnv, loadEnv, type Env } from './config/env.ts';
import { createContext } from './context.ts';
import { createLogger } from './core/logger.ts';
import { openDatabase } from './db/client.ts';
import { migrate } from './db/migrate.ts';
import { sweepSessions } from './modules/auth/auth.service.ts';

const SHUTDOWN_GRACE_MS = 10_000;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const SESSION_SWEEP_MS = 60 * 60 * 1000;

function engineFromEnv(env: Env): { engine: Engine; provider: string | null } {
  if (env.REHEARSAL_ENGINE === 'mirofish') return { engine: mirofishEngine({ client: mirofishClient({ baseUrl: env.MIROFISH_URL as string }) }), provider: 'mirofish' };
  const llm = llmFromEnv(env, { userAgent: 'flockcast/1.0' });
  return { engine: swarmEngine({ llm }), provider: llm?.provider ?? null };
}

function main(): void {
  const log = createLogger({ service: 'flockcast' });
  const env = loadEnv();
  const host = process.env.HOST ?? '127.0.0.1';

  const db = openDatabase(env.REHEARSAL_DB);
  const { applied } = migrate(db);
  if (applied.length) log.info('migrated', { applied });

  const { engine, provider } = engineFromEnv(env);
  const app = createContext({ db, config: configFromEnv(env), engine, provider, log });
  const interrupted = app.rehearsals.recover();
  if (interrupted) log.warn('rehearsals_interrupted', { count: interrupted });
  if (!LOCAL_HOSTS.has(host) && !app.config.secureCookies) {
    // session cookies sent over plain http can be read on the network
    log.warn('insecure_cookies', { host, hint: 'Serve over HTTPS with NODE_ENV=production so session cookies are Secure.' });
  }
  if (app.config.signup === 'closed' && !app.config.ownerEmail && !app.accounts.hasAccounts() && !LOCAL_HOSTS.has(host)) {
    log.warn('owner_not_set', { hint: 'Set REHEARSAL_OWNER_EMAIL so only you can create the first account on a public server.' });
  }
  sweepSessions(app);
  const sweeper = setInterval(() => sweepSessions(app), SESSION_SWEEP_MS);
  sweeper.unref();

  const server = serve({ fetch: createApp(app).fetch, hostname: host, port: env.PORT }, () => {
    log.info('listening', { url: `http://${host}:${env.PORT}`, db: env.REHEARSAL_DB, signup: app.config.signup, engine: engine.kind, provider, model: engine.model });
  });

  // finish in-flight rehearsals (they write their own status), then close the database
  const shutdown = (signal: string) => {
    log.info('shutting_down', { signal, pending_jobs: app.jobs.pending });
    server.close();
    const timer = setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS);
    void app.jobs.idle().then(() => {
      clearTimeout(timer);
      db.close();
      process.exit(0);
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main();
