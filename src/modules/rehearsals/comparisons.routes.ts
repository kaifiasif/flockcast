import type { z } from 'zod';
import type { Rehearsals } from '../../../engine/index.ts';
import type { Project } from '../../db/repositories/projects.repository.ts';
import { notFound } from '../../core/errors.ts';
import { router } from '../../http/types.ts';
import { validate } from '../../http/validate.ts';
import { requireFeature } from '../../core/plans.ts';
import { checkRehearsalPlan, ownProject } from '../projects/access.ts';
import { CompareInput, GroupParam, IdParam, OutcomeInput, ProjectRehearsalParam } from '../projects/projects.schemas.ts';
import { engineCall } from './rehearsal-errors.ts';
import { settingsFor } from './rehearsals.routes.ts';

export function compareFor(rehearsals: Rehearsals, project: Project, body: z.infer<typeof CompareInput>) {
  return engineCall(() =>
    rehearsals.compare(project.id, {
      source: 'text',
      refs: body.drafts.map((d) => ({ text: d.text, title: d.title })),
      settings: settingsFor(project, body),
    }),
  );
}

/** The drafts of one comparison, A first. Someone else's group is simply empty, so it answers 404. */
export function groupFor(rehearsals: Rehearsals, projectId: string, groupId: string) {
  const list = rehearsals.list(projectId, { group: groupId, limit: 3 }).sort((a, b) => (a.variant ?? '').localeCompare(b.variant ?? ''));
  if (!list.length) throw notFound('Comparison');
  return list;
}

/** Comparing drafts on one crowd, real results after posting, and how close rehearsals came. */
export function comparisonsRoutes() {
  return router()
    .post('/projects/:id/comparisons', validate('param', IdParam), validate('json', CompareInput), async (c) => {
      const ctx = c.var.ctx;
      const project = ownProject(ctx, c.req.valid('param').id, 'edit');
      const body = c.req.valid('json');
      const plan = ctx.planOf(project);
      requireFeature(plan, 'compare');
      checkRehearsalPlan(plan, ctx.usedThisMonth(project), body, project, body.drafts.length);
      const rehearsals = await compareFor(ctx.rehearsals, project, body);
      ctx.audit(project, 'comparison.started', rehearsals[0].group_id!, { drafts: rehearsals.length });
      return c.json({ group_id: rehearsals[0].group_id!, rehearsals }, 202);
    })
    .get('/projects/:id/comparisons/:gid', validate('param', GroupParam), (c) => {
      const ctx = c.var.ctx;
      const { id, gid } = c.req.valid('param');
      ownProject(ctx, id);
      return c.json({ group_id: gid, rehearsals: groupFor(ctx.rehearsals, id, gid) });
    })
    .put('/projects/:id/rehearsals/:rid/outcome', validate('param', ProjectRehearsalParam), validate('json', OutcomeInput), async (c) => {
      const ctx = c.var.ctx;
      const { id, rid } = c.req.valid('param');
      const project = ownProject(ctx, id, 'edit');
      requireFeature(ctx.planOf(project), 'calibration');
      const rehearsal = await engineCall(() => ctx.rehearsals.recordOutcome(id, rid, c.req.valid('json')));
      ctx.audit(project, 'outcome.recorded', rid);
      return c.json({ rehearsal });
    })
    .delete('/projects/:id/rehearsals/:rid/outcome', validate('param', ProjectRehearsalParam), async (c) => {
      const ctx = c.var.ctx;
      const { id, rid } = c.req.valid('param');
      const project = ownProject(ctx, id, 'edit');
      await engineCall(() => ctx.rehearsals.clearOutcome(id, rid));
      ctx.audit(project, 'outcome.removed', rid);
      return c.json({ ok: true });
    })
    .get('/projects/:id/calibration', validate('param', IdParam), (c) => {
      const ctx = c.var.ctx;
      const project = ownProject(ctx, c.req.valid('param').id);
      return c.json({ calibration: ctx.rehearsals.calibration(project.id) });
    });
}
