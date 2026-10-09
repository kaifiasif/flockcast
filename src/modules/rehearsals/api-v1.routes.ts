import { Hono, type MiddlewareHandler } from 'hono';
import type { AppServices } from '../../context.ts';
import { AppError, ErrorCode, notFound } from '../../core/errors.ts';
import { findActiveKey, touchKey } from '../../db/repositories/api-keys.repository.ts';
import { createProjectsRepository, type Project } from '../../db/repositories/projects.repository.ts';
import { nowIso } from '../../domain/ids.ts';
import { createRateLimiter, rateLimit } from '../../http/middleware/rate-limit.ts';
import { validate } from '../../http/validate.ts';
import { hashApiKey, looksLikeApiKey } from '../projects/projects.routes.ts';
import { IdParam, InterviewInput, ListQuery, RehearsalInput } from '../projects/projects.schemas.ts';
import { engineCall } from './rehearsal-errors.ts';
import { listFor, startFor } from './rehearsals.routes.ts';

type KeyEnv = { Variables: { requestId: string; project: Project; keyId: string } };

/** last_used_at is written at most this often, so reads do not turn into writes. */
const TOUCH_EVERY_MS = 10 * 60 * 1000;

/**
 * API keys arrive only in the Authorization header, never as a cookie, so cross-site requests cannot
 * carry them (no CSRF). A key works for its own project and nothing else.
 */
function requireApiKey(app: AppServices): MiddlewareHandler<KeyEnv> {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const key = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const found = looksLikeApiKey(key) ? findActiveKey(app.db, hashApiKey(key)) : undefined;
    if (!found) throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Send a valid project API key as "Authorization: Bearer flk_...".');
    const project = createProjectsRepository(app.db, found.user_id).find(found.project_id);
    if (!project) throw new AppError(401, ErrorCode.UNAUTHORIZED, 'This key belongs to a project that no longer exists.');
    if (!found.last_used_at || Date.now() - Date.parse(found.last_used_at) > TOUCH_EVERY_MS) touchKey(app.db, found.id, nowIso());
    c.set('project', project);
    c.set('keyId', found.id);
    await next();
  };
}

/**
 * The API other apps call (Creator OS, scripts, CI). Same engine, same limits; the key picks the project.
 * Mounted at /api/v1.
 */
export function apiV1Routes(app: AppServices) {
  const costly = createRateLimiter(app.config.rateLimits.costly);
  return new Hono<KeyEnv>()
    .use(requireApiKey(app))
    .use(rateLimit(costly, { trustProxy: app.config.trustProxy, applies: (c) => c.req.method === 'POST', key: (c) => `key:${c.get('keyId')}` }))
    .get('/project', (c) => {
      const { id, name, platform, handle, personas, rounds } = c.var.project;
      return c.json({ project: { id, name, platform, handle, personas, rounds } });
    })
    .get('/rehearsals', validate('query', ListQuery), (c) => c.json({ rehearsals: listFor(app.rehearsals, c.var.project.id, c.req.valid('query')) }))
    .post('/rehearsals', validate('json', RehearsalInput), async (c) => {
      const rehearsal = await startFor(app.rehearsals, c.var.project, c.req.valid('json'));
      return c.json({ rehearsal }, 202);
    })
    .get('/rehearsals/:id', validate('param', IdParam), async (c) => c.json({ rehearsal: await engineCall(() => app.rehearsals.get(c.var.project.id, c.req.valid('param').id)) }))
    .post('/rehearsals/:id/interview', validate('param', IdParam), validate('json', InterviewInput), async (c) => {
      const interview = await engineCall(() => app.rehearsals.interview(c.var.project.id, c.req.valid('param').id, c.req.valid('json')));
      return c.json({ interview });
    })
    .all('*', () => {
      throw notFound('Endpoint');
    });
}
