import type { z } from 'zod';
import type { RehearsalSettings, Rehearsals } from '../../../engine/index.ts';
import type { Project } from '../../db/repositories/projects.repository.ts';
import { router } from '../../http/types.ts';
import { validate } from '../../http/validate.ts';
import { ownProject } from '../projects/projects.routes.ts';
import { IdParam, InterviewInput, ListQuery, ProjectRehearsalParam, RehearsalInput } from '../projects/projects.schemas.ts';
import { engineCall } from './rehearsal-errors.ts';

/** The project's saved setup, with any one-off changes from the request on top. */
export function settingsFor(project: Project, body: Partial<z.infer<typeof RehearsalInput>>): Partial<RehearsalSettings> {
  return {
    platform: body.platform ?? project.platform,
    handle: project.handle,
    audience: body.audience?.trim() || project.audience,
    personas: body.personas ?? project.personas,
    rounds: body.rounds ?? project.rounds,
    critic: body.critic,
    mode: body.mode,
  };
}

export function startFor(rehearsals: Rehearsals, project: Project, body: z.infer<typeof RehearsalInput>) {
  return engineCall(() =>
    rehearsals.start(project.id, {
      source: 'text',
      ref: { text: body.text, title: body.title, subject: body.subject },
      settings: settingsFor(project, body),
      force: body.force,
    }),
  );
}

/** Callers filter by their own subject; the text source stores it as "ref:<subject>". */
export function listFor(rehearsals: Rehearsals, projectId: string, query: z.infer<typeof ListQuery>) {
  return rehearsals.list(projectId, { limit: query.limit, subject: query.subject ? `ref:${query.subject}` : undefined });
}

/** Rehearsals for the signed-in user's projects. The project is checked first; the engine is scoped by its id. */
export function rehearsalsRoutes() {
  return router()
    .get('/projects/:id/rehearsals', validate('param', IdParam), validate('query', ListQuery), (c) => {
      const ctx = c.var.ctx;
      const project = ownProject(ctx, c.req.valid('param').id);
      return c.json({ rehearsals: listFor(ctx.rehearsals, project.id, c.req.valid('query')) });
    })
    .post('/projects/:id/rehearsals', validate('param', IdParam), validate('json', RehearsalInput), async (c) => {
      const ctx = c.var.ctx;
      const project = ownProject(ctx, c.req.valid('param').id);
      const rehearsal = await startFor(ctx.rehearsals, project, c.req.valid('json'));
      return c.json({ rehearsal }, 202);
    })
    .get('/projects/:id/rehearsals/:rid', validate('param', ProjectRehearsalParam), async (c) => {
      const ctx = c.var.ctx;
      const { id, rid } = c.req.valid('param');
      ownProject(ctx, id);
      return c.json({ rehearsal: await engineCall(() => ctx.rehearsals.get(id, rid)) });
    })
    .delete('/projects/:id/rehearsals/:rid', validate('param', ProjectRehearsalParam), async (c) => {
      const ctx = c.var.ctx;
      const { id, rid } = c.req.valid('param');
      ownProject(ctx, id);
      await engineCall(() => ctx.rehearsals.remove(id, rid));
      return c.json({ ok: true });
    })
    .post('/projects/:id/rehearsals/:rid/interview', validate('param', ProjectRehearsalParam), validate('json', InterviewInput), async (c) => {
      const ctx = c.var.ctx;
      const { id, rid } = c.req.valid('param');
      ownProject(ctx, id);
      return c.json({ interview: await engineCall(() => ctx.rehearsals.interview(id, rid, c.req.valid('json'))) });
    });
}
