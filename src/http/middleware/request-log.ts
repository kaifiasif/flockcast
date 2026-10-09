import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import type { Logger } from '../../core/logger.ts';

const SAFE_REQUEST_ID = /^[\w.-]{1,64}$/;

/** Gives every request an id (echoed in x-request-id) and logs method, path, status and duration. */
export function requestLog(log: Logger): MiddlewareHandler {
  return async (c, next) => {
    const started = performance.now();
    // a caller may pass its own id for tracing, but only a plain token: it is echoed into a header and the logs
    const given = c.req.header('x-request-id');
    const requestId = given && SAFE_REQUEST_ID.test(given) ? given : randomUUID();
    c.set('requestId', requestId);
    c.header('x-request-id', requestId);
    await next();
    log.info('request', { request_id: requestId, method: c.req.method, path: c.req.path, status: c.res.status, ms: Math.round(performance.now() - started) });
  };
}
