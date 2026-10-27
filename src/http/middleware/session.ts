import type { MiddlewareHandler } from 'hono';
import type { AppServices } from '../../context.ts';
import { AppError, ErrorCode } from '../../core/errors.ts';
import { resolveSession } from '../../modules/auth/auth.service.ts';
import { readSessionToken } from '../../modules/auth/session-cookie.ts';
import type { AppEnv } from '../types.ts';

/**
 * Closed by default: every route registered after this needs a signed-in user. It also hands
 * the route that user's context, whose repositories only ever see their own rows.
 */
export function requireSession(app: AppServices): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = readSessionToken(c, app.config.secureCookies);
    const session = token ? resolveSession(app, token) : null;
    if (!session) throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Log in to continue.');
    c.set('session', session);
    c.set('ctx', app.forUser(session.user.id));
    c.set('app', app);
    await next();
  };
}
