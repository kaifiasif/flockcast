import { router } from '../../http/types.ts';
import { validate } from '../../http/validate.ts';
import { requireFeature } from '../../core/plans.ts';
import { ownProject } from '../projects/access.ts';
import { IdParam } from '../projects/projects.schemas.ts';
import { engineCall } from '../rehearsals/rehearsal-errors.ts';
import { AdviceInput, AdviceListQuery, ProjectAdviceParam } from './advice.schemas.ts';

/** Launch advice for the signed-in user's projects. The project is checked first; the advisor is scoped by its id. */
export function adviceRoutes() {
  return router()
    .get('/projects/:id/advice', validate('param', IdParam), validate('query', AdviceListQuery), (c) => {
      const ctx = c.var.ctx;
      const project = ownProject(ctx, c.req.valid('param').id);
      return c.json({ advice: ctx.advisor.list(project.id, c.req.valid('query')) });
    })
    .post('/projects/:id/advice', validate('param', IdParam), validate('json', AdviceInput), async (c) => {
      const ctx = c.var.ctx;
      const project = ownProject(ctx, c.req.valid('param').id, 'edit');
      requireFeature(ctx.planOf(project), 'advisor');
      const advice = await engineCall(() => ctx.advisor.start(project.id, c.req.valid('json')));
      ctx.audit(project, 'advice.started', advice.id);
      return c.json({ advice }, 202);
    })
    .get('/projects/:id/advice/:aid', validate('param', ProjectAdviceParam), async (c) => {
      const ctx = c.var.ctx;
      const { id, aid } = c.req.valid('param');
      ownProject(ctx, id);
      return c.json({ advice: await engineCall(() => ctx.advisor.get(id, aid)) });
    })
    .delete('/projects/:id/advice/:aid', validate('param', ProjectAdviceParam), async (c) => {
      const ctx = c.var.ctx;
      const { id, aid } = c.req.valid('param');
      ownProject(ctx, id, 'edit');
      await engineCall(() => ctx.advisor.remove(id, aid));
      return c.json({ ok: true });
    });
}
