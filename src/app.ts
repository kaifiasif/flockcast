import { join } from 'node:path';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppServices } from './context.ts';
import { AppError, ErrorCode } from './core/errors.ts';
import { createErrorHandler } from './http/error-handler.ts';
import { createRateLimiter, rateLimit } from './http/middleware/rate-limit.ts';
import { requestLog } from './http/middleware/request-log.ts';
import { sameOrigin } from './http/middleware/same-origin.ts';
import { securityHeaders } from './http/middleware/security-headers.ts';
import { requireSession } from './http/middleware/session.ts';
import { serveWebApp } from './http/static.ts';
import type { AppEnv } from './http/types.ts';
import { adviceRoutes } from './modules/advice/advice.routes.ts';
import { authRoutes } from './modules/auth/auth.routes.ts';
import { projectsRoutes } from './modules/projects/projects.routes.ts';
import { apiV1Routes } from './modules/rehearsals/api-v1.routes.ts';
import { rehearsalsRoutes } from './modules/rehearsals/rehearsals.routes.ts';
import { healthRoutes, systemRoutes } from './modules/system/system.routes.ts';

const ROOT = join(import.meta.dirname, '..');

/** Starting a rehearsal, asking a follower or asking for launch advice spends model tokens. */
const COSTLY = /^\/api\/projects\/[^/]+\/(rehearsals(\/[^/]+\/interview)?|advice)$/;
const isCostly = (method: string, path: string) => method === 'POST' && COSTLY.test(path);
/** The largest body any endpoint needs: a project with 25 past posts. */
const MAX_BODY = 64 * 1024;

/** Composes the HTTP app. Every feature module contributes its own router; nothing else knows its routes. */
export function createApp(app: AppServices, options: { publicDir?: string } = {}) {
  const { rateLimits, trustProxy } = app.config;
  const tooLarge = () => {
    throw new AppError(413, ErrorCode.PAYLOAD_TOO_LARGE, 'That request is too large.');
  };

  const api = new Hono<AppEnv>()
    .use(bodyLimit({ maxSize: MAX_BODY, onError: tooLarge }))
    .use(rateLimit(createRateLimiter(rateLimits.api), { trustProxy }))
    // apps calling with a project key: no cookies, so no cross-site risk; own auth and limits
    .route('/v1', apiV1Routes(app) as unknown as Hono<AppEnv>)
    .use(sameOrigin())
    // public: health checks, and signing up or in
    .route('/', healthRoutes(app))
    .route('/auth', authRoutes(app))
    // everything below needs a session, and sees only that user's projects
    .use(requireSession(app))
    .use(rateLimit(createRateLimiter(rateLimits.costly), { trustProxy, applies: (c) => isCostly(c.req.method, c.req.path), key: (c) => `user:${c.get('session').user.id}` }))
    .route('/', systemRoutes(app))
    .route('/', projectsRoutes())
    .route('/', rehearsalsRoutes())
    .route('/', adviceRoutes())
    .all('*', () => {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'No such endpoint.');
    });

  return new Hono<AppEnv>()
    .use(requestLog(app.log))
    .use(securityHeaders())
    .route('/api', api)
    .get('*', serveWebApp(options.publicDir ?? join(ROOT, 'public')))
    .onError(createErrorHandler(app.log));
}
export type App = ReturnType<typeof createApp>;
