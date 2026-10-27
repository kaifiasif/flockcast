import { createAdvisor, createRehearsals, createResearch, sqliteAdviceStore, sqliteStore, sqliteStudyStore, textSource, type Advisor, type Research, type Agents, type Engine, type Rehearsals, type SearchSource } from '../engine/index.ts';
import type { AppConfig } from './config/env.ts';
import { createJobRunner, type JobRunner } from './core/jobs.ts';
import { createLogger, errorFields, type Logger } from './core/logger.ts';
import type { Database } from './db/client.ts';
import { createAccountsRepository, type AccountsRepository } from './db/repositories/accounts.repository.ts';
import { createApiKeysRepository, type ApiKeysRepository } from './db/repositories/api-keys.repository.ts';
import { createGovernanceRepository, rehearsalsSince, writeAudit, type GovernanceRepository } from './db/repositories/governance.repository.ts';
import { createProjectsRepository, projectExamples, type Project, type ProjectsRepository } from './db/repositories/projects.repository.ts';
import { createTeamRepository, type TeamRepository } from './db/repositories/team.repository.ts';
import { createWebhooksRepository, type WebhooksRepository } from './db/repositories/webhooks.repository.ts';
import { effectivePlan, type Plan } from './core/plans.ts';
import { createWebhookSender, type WebhookSender } from './core/webhooks.ts';
import { uuidv7 } from './domain/ids.ts';

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
  research: Research;
  /** For /api/config: which engine and model run, never their keys. */
  engine: { kind: Engine['kind']; model: string | null; provider: string | null; interviews: boolean };
  webhooks: WebhookSender;
  /** The plan whose rules apply to a project: its owner's, or Enterprise with plans off. */
  planOf(project: Pick<Project, 'owner_plan'>): Plan;
  /** Writes an audit event for a project. Never throws. */
  audit(projectId: string, who: { userId: string | null; actor: string }, action: string, target?: string, details?: Record<string, unknown>): void;
  forUser(userId: string): AppContext;
}

/** What a feature route sees: one signed-in user's data and nothing else. */
export interface AppContext {
  userId: string;
  log: Logger;
  projects: ProjectsRepository;
  keys: ApiKeysRepository;
  team: TeamRepository;
  governance: GovernanceRepository;
  hooks: WebhooksRepository;
  rehearsals: Rehearsals;
  advisor: Advisor;
  research: Research;
  planOf(project: Pick<Project, 'owner_plan'>): Plan;
  /** This user's own plan id, for what they create. */
  ownPlan(): string;
  /** Rehearsals the project's owner started this calendar month (UTC), for the plan's cap. */
  usedThisMonth(project: Project): number;
  /** Records what this user did on a project. */
  audit(project: Pick<Project, 'id'>, action: string, target?: string, details?: Record<string, unknown>): void;
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
  const webhooks = createWebhookSender({ db: deps.db, log, allowPrivate: deps.config.webhooks.allowPrivate });
  const rehearsals = createRehearsals({
    store: sqliteStore(deps.db),
    engine: deps.engine,
    // the project's saved past posts shape who the followers are
    sources: [textSource({ examplesFor: (projectId) => projectExamples(deps.db, projectId) })],
    background: (job) => jobs.enqueue('rehearsal', job),
    // plans cap crowds lower; this is the most any plan allows
    limits: { ...deps.config.limits, maxPersonas: 50 },
    onFinish: (r) =>
      webhooks.emit(r.scope, 'rehearsal.finished', {
        rehearsal_id: r.id,
        title: r.title,
        status: r.status,
        group_id: r.group_id,
        variant: r.variant,
        error: r.error,
        counts: r.result?.counts ?? null,
        pushback_share: r.result?.pushback_share ?? null,
        engine: r.result?.engine ?? null,
      }),
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

  const research = createResearch({
    store: sqliteStudyStore(deps.db),
    agents: deps.agents,
    background: (job) => jobs.enqueue('study', job),
    limits: { runsPerScopePerDay: deps.config.limits.studiesPerProjectPerDay },
    onError: (e, at) => log.warn('study_failed', { project_id: at.scope, study_id: at.id, ...errorFields(e) }),
  });

  const planOf = (project: Pick<Project, 'owner_plan'>) => effectivePlan(deps.config.plans, project.owner_plan);
  const audit: AppServices['audit'] = (projectId, who, action, target, details) => {
    try {
      writeAudit(deps.db, { id: uuidv7(), project_id: projectId, user_id: who.userId, actor: who.actor, action, target, details, at: new Date().toISOString() });
    } catch (e) {
      log.warn('audit_failed', { project_id: projectId, action, ...errorFields(e) });
    }
  };

  const services: AppServices = {
    db: deps.db,
    config: deps.config,
    jobs,
    log,
    accounts: createAccountsRepository(deps.db),
    rehearsals,
    advisor,
    research,
    engine: { kind: deps.engine.kind, model: deps.engine.model, provider: deps.provider ?? null, interviews: deps.engine.canInterview },
    webhooks,
    planOf,
    audit,
    forUser: (userId) => {
      let email: string | undefined;
      const actor = () => (email ??= deps.db.get<{ email: string }>('SELECT email FROM users WHERE id = ?', userId)?.email ?? userId);
      return {
        userId,
        log: log.child({ user_id: userId }),
        projects: createProjectsRepository(deps.db, userId),
        keys: createApiKeysRepository(deps.db, userId),
        team: createTeamRepository(deps.db, userId),
        governance: createGovernanceRepository(deps.db, userId),
        hooks: createWebhooksRepository(deps.db, userId),
        rehearsals,
        advisor,
        research,
        planOf,
        ownPlan: () => deps.db.get<{ plan: string }>('SELECT plan FROM users WHERE id = ?', userId)?.plan ?? 'free',
        usedThisMonth: (project) => {
          const owner = deps.db.get<{ user_id: string }>('SELECT user_id FROM projects WHERE id = ?', project.id)?.user_id;
          const start = new Date();
          return owner ? rehearsalsSince(deps.db, owner, new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)).toISOString()) : 0;
        },
        audit: (project, action, target, details) => audit(project.id, { userId, actor: actor() }, action, target, details),
      };
    },
  };
  return services;
}
