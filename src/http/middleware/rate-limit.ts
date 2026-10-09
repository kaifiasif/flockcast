import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context, MiddlewareHandler } from 'hono';
import { AppError, ErrorCode } from '../../core/errors.ts';

export interface RateLimit {
  limit: number;
  windowMs: number;
}

/**
 * Fixed-window counters kept in memory. Fine for the single process this app runs as; a second
 * instance would need a shared store (Redis) instead.
 */
export function createRateLimiter({ limit, windowMs }: RateLimit) {
  const windows = new Map<string, { count: number; resetAt: number }>();
  let nextSweep = 0;

  return {
    /** Counts one hit for `key`; returns how long to wait when the limit is already used up. */
    hit(key: string, now = Date.now()): { allowed: true } | { allowed: false; retryAfterS: number } {
      if (now >= nextSweep) {
        for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
        nextSweep = now + windowMs;
      }
      const current = windows.get(key);
      const window = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };
      window.count++;
      windows.set(key, window);
      return window.count <= limit ? { allowed: true } : { allowed: false, retryAfterS: Math.ceil((window.resetAt - now) / 1000) };
    },
    /** Gives back one hit, for attempts counted up front that turned out fine. */
    refund(key: string): void {
      const w = windows.get(key);
      if (w && w.count > 0) w.count--;
    },
    /** Seconds to wait if `key` has used up its limit, without counting a hit; null when it may proceed. */
    blockedFor(key: string, now = Date.now()): number | null {
      const w = windows.get(key);
      return w && w.resetAt > now && w.count >= limit ? Math.ceil((w.resetAt - now) / 1000) : null;
    },
  };
}
export type RateLimiter = ReturnType<typeof createRateLimiter>;

/**
 * The caller's address. Behind a proxy (Render, Fly) every request comes from the proxy, so the
 * X-Forwarded-For header is used, but only when TRUST_PROXY says a proxy sets it. The proxy
 * appends the address it saw to whatever the client sent, so the last entry is the real one; the
 * first could be anything the client chose.
 */
export function clientKey(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim();
    if (forwarded) return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown'; // in-process requests (tests) have no socket
  }
}

export function tooManyRequests(c: Context, retryAfterS: number): never {
  c.header('retry-after', String(retryAfterS));
  throw new AppError(429, ErrorCode.RATE_LIMITED, `Too many requests. Try again in ${retryAfterS} seconds.`, { retry_after_s: retryAfterS });
}

/** Applies `limiter` to the requests `applies` selects, per client unless `key` says otherwise (per account, say). */
export function rateLimit(
  limiter: RateLimiter,
  options: { trustProxy: boolean; applies?: (c: Context) => boolean; key?: (c: Context) => string },
): MiddlewareHandler {
  return async (c, next) => {
    if (!options.applies || options.applies(c)) {
      const result = limiter.hit(options.key ? options.key(c) : clientKey(c, options.trustProxy));
      if (!result.allowed) tooManyRequests(c, result.retryAfterS);
    }
    await next();
  };
}
