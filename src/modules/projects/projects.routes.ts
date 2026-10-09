import { createHash, randomBytes } from 'node:crypto';
import type { AppContext } from '../../context.ts';
import { notFound } from '../../core/errors.ts';
import type { Project } from '../../db/repositories/projects.repository.ts';
import { nowIso, uuidv7 } from '../../domain/ids.ts';
import { router } from '../../http/types.ts';
import { validate } from '../../http/validate.ts';
import { IdParam, KeyInput, ProjectInput, ProjectKeyParam } from './projects.schemas.ts';

/** The project, through the signed-in user's own repository: anyone else's id reads as not found. */
export function ownProject(ctx: AppContext, id: string): Project {
  const project = ctx.projects.find(id);
  if (!project) throw notFound('Project');
  return project;
}

/** API keys: "flk_" + 32 random bytes. Only the sha256 is stored; the key is shown once. */
const KEY_PREFIX = 'flk_';
export const newApiKey = () => `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
export const hashApiKey = (key: string) => createHash('sha256').update(key).digest('hex');
export const looksLikeApiKey = (key: string) => key.startsWith(KEY_PREFIX) && /^flk_[\w-]{43}$/.test(key);

export function projectsRoutes() {
  return router()
    .get('/projects', (c) => c.json({ projects: c.var.ctx.projects.list() }))
    .post('/projects', validate('json', ProjectInput), (c) => {
      const ctx = c.var.ctx;
      const id = crypto.randomUUID();
      ctx.projects.create({ id, at: nowIso(), ...c.req.valid('json') });
      ctx.log.info('project_created', { project_id: id });
      return c.json({ project: ownProject(ctx, id) }, 201);
    })
    .get('/projects/:id', validate('param', IdParam), (c) => c.json({ project: ownProject(c.var.ctx, c.req.valid('param').id) }))
    .put('/projects/:id', validate('param', IdParam), validate('json', ProjectInput), (c) => {
      const ctx = c.var.ctx;
      const { id } = c.req.valid('param');
      if (!ctx.projects.update(id, c.req.valid('json'), nowIso())) throw notFound('Project');
      return c.json({ project: ownProject(ctx, id) });
    })
    .delete('/projects/:id', validate('param', IdParam), (c) => {
      const ctx = c.var.ctx;
      const { id } = c.req.valid('param');
      if (!ctx.projects.remove(id)) throw notFound('Project');
      ctx.log.info('project_deleted', { project_id: id });
      return c.json({ ok: true });
    })

    // ------------------------------------------------------------ API keys
    .get('/projects/:id/keys', validate('param', IdParam), (c) => {
      const { id } = c.req.valid('param');
      ownProject(c.var.ctx, id);
      return c.json({ keys: c.var.ctx.keys.list(id) });
    })
    .post('/projects/:id/keys', validate('param', IdParam), validate('json', KeyInput), (c) => {
      const ctx = c.var.ctx;
      const { id } = c.req.valid('param');
      ownProject(ctx, id);
      const key = newApiKey();
      const keyId = uuidv7();
      ctx.keys.create({ id: keyId, project_id: id, name: c.req.valid('json').name, prefix: key.slice(0, 10), hash: hashApiKey(key), at: nowIso() });
      ctx.log.info('api_key_created', { project_id: id, key_id: keyId });
      const created = ctx.keys.list(id).find((k) => k.id === keyId);
      // the only time the full key leaves the server
      return c.json({ key: created, secret: key }, 201);
    })
    .delete('/projects/:id/keys/:kid', validate('param', ProjectKeyParam), (c) => {
      const ctx = c.var.ctx;
      const { id, kid } = c.req.valid('param');
      ownProject(ctx, id);
      if (!ctx.keys.revoke(id, kid, nowIso())) throw notFound('Key');
      ctx.log.info('api_key_revoked', { project_id: id, key_id: kid });
      return c.json({ ok: true });
    });
}
