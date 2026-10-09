import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { AppError, ErrorCode } from '../core/errors.ts';
import { errorFields, type Logger } from '../core/logger.ts';

/**
 * One error shape for every endpoint: { error: { code, message, details? } }.
 * Caller mistakes are returned as-is and logged at info. Our failures are logged with the stack
 * and the caller gets a generic message plus the request id to quote.
 */
export function createErrorHandler(log: Logger) {
  return (err: Error, c: Context) => {
    const requestId = c.get('requestId') as string | undefined;
    if (err instanceof AppError && err.isClientError) {
      log.info('request_rejected', { request_id: requestId, path: c.req.path, status: err.status, code: err.code });
      return c.json({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } }, err.status as 400);
    }
    if (err instanceof HTTPException && err.status < 500) {
      const code = err.status === 413 ? ErrorCode.PAYLOAD_TOO_LARGE : err.status === 401 ? ErrorCode.UNAUTHORIZED : ErrorCode.VALIDATION_FAILED;
      return c.json({ error: { code, message: err.message || 'Bad request.' } }, err.status);
    }
    log.error('request_failed', { request_id: requestId, method: c.req.method, path: c.req.path, ...errorFields(err) });
    return c.json({ error: { code: ErrorCode.INTERNAL, message: 'Something went wrong on the server.', details: { request_id: requestId } } }, 500);
  };
}
