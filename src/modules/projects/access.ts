import type { AppContext } from '../../context.ts';
import { AppError, ErrorCode, notFound } from '../../core/errors.ts';
import { requireFeature, requireLimit, type Plan } from '../../core/plans.ts';
import type { Project, Role } from '../../db/repositories/projects.repository.ts';

/** What someone wants to do on a project, and the roles that may. */
export type Need = 'view' | 'edit' | 'review' | 'manage';
const CAN: Record<Need, readonly Role[]> = {
  view: ['owner', 'editor', 'reviewer', 'viewer'],
  edit: ['owner', 'editor'],
  review: ['owner', 'reviewer'],
  manage: ['owner'],
};
const REFUSED: Record<Need, string> = {
  view: 'You cannot see this project.',
  edit: 'Your role on this project can read rehearsals but not start or change them. Ask the owner to make you an editor.',
  review: 'Only reviewers and the owner can decide approvals.',
  manage: 'Only the project owner can do that.',
};

/**
 * The project, through the signed-in user's own repository: a project they are not on reads as not
 * found (404), and a project they are on but whose role cannot do this answers 403.
 */
export function ownProject(ctx: AppContext, id: string, need: Need = 'view'): Project {
  const project = ctx.projects.find(id);
  if (!project) throw notFound('Project');
  if (!CAN[need].includes(project.role)) throw new AppError(403, ErrorCode.FORBIDDEN, REFUSED[need]);
  return project;
}

/** The plan checks every new rehearsal goes through, from the app or the API. */
export function checkRehearsalPlan(plan: Plan, used: number, body: { personas?: number; mode?: string }, project: Pick<Project, 'personas'>, count = 1): void {
  if (body.mode === 'quick') requireFeature(plan, 'quick');
  requireLimit(plan, 'maxPersonas', body.personas ?? project.personas, 0);
  requireLimit(plan, 'rehearsalsPerMonth', used, count);
}
