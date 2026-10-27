import { brandOf } from '../../../engine/index.ts';
import { notFound } from '../../core/errors.ts';
import { requireFeature } from '../../core/plans.ts';
import { router } from '../../http/types.ts';
import { validate } from '../../http/validate.ts';
import { nowIso } from '../../domain/ids.ts';
import { ownProject } from '../projects/access.ts';
import { IdParam } from '../projects/projects.schemas.ts';
import { engineCall } from '../rehearsals/rehearsal-errors.ts';
import { BrandInput, ProjectStudyParam, StudyInput, StudyListQuery } from './research.schemas.ts';

/** Studies and brand rules for the signed-in user's projects. The project is checked first; studies are scoped by its id. */
export function researchRoutes() {
  return router()
    .get('/projects/:id/studies', validate('param', IdParam), validate('query', StudyListQuery), (c) => {
      const ctx = c.var.ctx;
      const project = ownProject(ctx, c.req.valid('param').id);
      return c.json({ studies: ctx.research.list(project.id, c.req.valid('query')) });
    })
    .post('/projects/:id/studies', validate('param', IdParam), validate('json', StudyInput), async (c) => {
      const ctx = c.var.ctx;
      const project = ownProject(ctx, c.req.valid('param').id, 'edit');
      const plan = ctx.planOf(project);
      requireFeature(plan, 'research');
      const study = await engineCall(() => ctx.research.start(project.id, c.req.valid('json'), { brand: plan.features.includes('brand') ? project.brand : null }));
      ctx.audit(project, 'study.started', study.id, { kind: study.kind, title: study.title });
      return c.json({ study }, 202);
    })
    .get('/projects/:id/studies/:sid', validate('param', ProjectStudyParam), async (c) => {
      const ctx = c.var.ctx;
      const { id, sid } = c.req.valid('param');
      ownProject(ctx, id);
      return c.json({ study: await engineCall(() => ctx.research.get(id, sid)) });
    })
    .delete('/projects/:id/studies/:sid', validate('param', ProjectStudyParam), async (c) => {
      const ctx = c.var.ctx;
      const { id, sid } = c.req.valid('param');
      const project = ownProject(ctx, id, 'edit');
      await engineCall(() => ctx.research.remove(id, sid));
      ctx.audit(project, 'study.deleted', sid);
      return c.json({ ok: true });
    })
    .put('/projects/:id/brand', validate('param', IdParam), validate('json', BrandInput), (c) => {
      const ctx = c.var.ctx;
      const project = ownProject(ctx, c.req.valid('param').id, 'manage');
      requireFeature(ctx.planOf(project), 'brand');
      const brand = brandOf(c.req.valid('json'));
      if (!ctx.projects.setBrand(project.id, brand, nowIso())) throw notFound('Project');
      ctx.audit(project, brand ? 'brand.updated' : 'brand.cleared');
      return c.json({ brand });
    });
}
