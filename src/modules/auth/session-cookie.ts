import { createHash, randomBytes } from 'node:crypto';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

/**
 * The session cookie holds 32 random bytes. The database keeps only their sha256, so a copy of
 * the database cannot be replayed as a login.
 *
 * HttpOnly: page scripts cannot read it. SameSite=Lax: other sites cannot send it with a form
 * POST. Secure in production, where it also takes the __Host- prefix, which pins it to this exact
 * host over HTTPS with no Domain attribute.
 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const NAME = 'flockcast_session';
const prefix = (secure: boolean) => (secure ? { prefix: 'host' as const } : {});

export const newSessionToken = () => randomBytes(32).toString('base64url');
export const sessionId = (token: string) => createHash('sha256').update(token).digest('hex');

export function readSessionToken(c: Context, secure: boolean): string | undefined {
  const token = getCookie(c, NAME, secure ? 'host' : undefined);
  return token && /^[\w-]{43}$/.test(token) ? token : undefined;
}

export function writeSessionCookie(c: Context, token: string, secure: boolean): void {
  setCookie(c, NAME, token, { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: SESSION_TTL_MS / 1000, ...prefix(secure) });
}

export function clearSessionCookie(c: Context, secure: boolean): void {
  deleteCookie(c, NAME, { path: '/', secure, ...prefix(secure) });
}
