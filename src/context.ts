import { createAdvisor, createRehearsals, sqliteAdviceStore, sqliteStore, textSource, type Advisor, type Agents, type Engine, type Rehearsals, type SearchSource } from '../engine/index.ts';
import type { AppConfig } from './config/env.ts';
import { createJobRunner, type JobRunner } from './core/jobs.ts';
import { createLogger, errorFields, type Logger } from './core/logger.ts';
import type { Database } from './db/client.ts';
import { createAccountsRepository, type AccountsRepository } from './db/repositories/accounts.repository.ts';
import { createApiKeysRepository, type ApiKeysRepository } from './db/repositories/api-keys.repository.ts';
import { createProjectsRepository, projectExamples, type ProjectsRepository } from './db/repositories/projects.repository.ts';

/**
 * Process-wide dependencies, passed explicitly. No module-level singletons: tests build these with a
 * fake model and an in-memory database, and production builds them at boot.
 *
 * Nothing here reads a user's projects: the only way in is `forUser`, whose repositories filter every
 * query by that user. Rehearsals are scoped by project id, and routes reach a project only through
 * the owner's repository first.
 */
export interface AppServices {
  db: Database;
  config: AppConfig;
  jobs: JobRunner;
  log: Logger;
  /** Users and sessions. Only the auth module uses this. */
  accounts: AccountsRepository;
  rehearsals: Rehearsals;
  advisor: Advisor;
  /** For /api/config: which engine and model run, never their keys. */
  engine: { kind: Engine['kind']; model: string | null; provider: string | null; interviews: boolean };
  forUser(userId: string): AppContext;
}

/** What a feature route sees: one signed-in user's data and nothing else. */
export interface AppContext {
  userId: string;
  log: Logger;
  projects: ProjectsRepository;
  keys: ApiKeysRepository;
  rehearsals: Rehearsals;
  advisor: Advisor;
}

export function createContext(deps: {
  db: Database;
  config: AppConfig;
  engine: Engine;
  provider?: string | null;
  /** The Python agents the launch advisor runs on; without a model it runs as research only. */
  agents: Agents;
  /** Where the advisor searches. Tests pass the canned "sample" source; nothing searches by default. */
  searchSources?: SearchSource[];
  log?: Logger;
}): AppServices {
  const log = deps.log ?? createLogger();
  const jobs = createJobRunner(log);
  const rehearsals = createRehearsals({
    store: sqliteStore(deps.db),
    engine: deps.engine,
    // the project's saved past posts shape who the followers are
    sources: [textSource({ examplesFor: (projectId) => projectExamples(deps.db, projectId) })],
    background: (job) => jobs.enqueue('rehearsal', job),
    limits: deps.config.limits,
    onError: (e, at) => log.warn('rehearsal_failed', { project_id: at.scope, rehearsal_id: at.id, ...errorFields(e) }),
  });
  const advisor = createAdvisor({
    store: sqliteAdviceStore(deps.db),
    agents: deps.agents,
    sources: deps.searchSources ?? [],
    background: (job) => jobs.enqueue('advice', job),
    limits: { runsPerScopePerDay: deps.config.limits.advicePerProjectPerDay },
    onError: (e, at) => log.warn('advice_failed', { project_id: at.scope, advice_id: at.id, ...errorFields(e) }),
  });

  const services: AppServices = {
    db: deps.db,
    config: deps.config,
    jobs,
    log,
    accounts: createAccountsRepository(deps.db),
    rehearsals,
    advisor,
    engine: { kind: deps.engine.kind, model: deps.engine.model, provider: deps.provider ?? null, interviews: deps.engine.canInterview },
    forUser: (userId) => ({
      userId,
      log: log.child({ user_id: userId }),
      projects: createProjectsRepository(deps.db, userId),
      keys: createApiKeysRepository(deps.db, userId),
      rehearsals,
      advisor,
    }),
  };
  return services;
}
