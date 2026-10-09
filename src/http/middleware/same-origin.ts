import type { MiddlewareHandler } from 'hono';
import { AppError, ErrorCode } from '../../core/errors.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cross-site request forgery guard. The session cookie is SameSite=Lax, so browsers already leave
 * it off cross-site POSTs; this is the second layer for older browsers and same-site subdomains.
 * A write is refused when the browser says it came from another site (Sec-Fetch-Site) or its
 * Origin is not this host. Reads are left alone: they change nothing.
 */
const hostOf = (origin: string) => {
  try {
    return new URL(origin).host;
  } catch {
    return null; // a malformed Origin counts as another site
  }
};

export function sameOrigin(): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header('host') ?? '';
    if (!SAFE_METHODS.has(c.req.method)) {
      const site = c.req.header('sec-fetch-site');
      const origin = c.req.header('origin');
      const crossSite = site === 'cross-site' || (origin !== undefined && origin !== 'null' && hostOf(origin) !== host);
      if (crossSite || origin === 'null') throw new AppError(403, ErrorCode.FORBIDDEN, 'Requests from other sites are not accepted.');
    }
    await next();
  };
}
