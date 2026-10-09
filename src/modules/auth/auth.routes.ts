import type { Context } from 'hono';
import type { AppServices } from '../../context.ts';
import { AppError, ErrorCode } from '../../core/errors.ts';
import { clientKey, createRateLimiter, tooManyRequests } from '../../http/middleware/rate-limit.ts';
import { requireSession } from '../../http/middleware/session.ts';
import { router } from '../../http/types.ts';
import { validate } from '../../http/validate.ts';
import { LoginInput, MfaDisableInput, MfaEnableInput, PasswordChangeInput, SignupInput } from './auth.schemas.ts';
import { changePassword, disableMfa, enableMfa, login, logout, resolveSession, signup, startMfaSetup } from './auth.service.ts';
import { clearSessionCookie, readSessionToken, writeSessionCookie } from './session-cookie.ts';

/**
 * Sign-up, log-in and account settings. Mounted before requireSession, so each route says whether
 * it needs a session. Wrong passwords and codes are counted per visitor and per email: guessing
 * is slow from one machine, and spreading guesses over many machines is slow for one account.
 */
export function authRoutes(app: AppServices) {
  const { trustProxy, rateLimits, secureCookies } = app.config;
  const failures = createRateLimiter(rateLimits.authFailures);
  // Per email the cap is looser, so a stranger typing wrong passwords cannot easily lock someone
  // out; it still stops many machines from slowly guessing one account.
  const emailFailures = createRateLimiter({ ...rateLimits.authFailures, limit: rateLimits.authFailures.limit * 5 });
  const signups = createRateLimiter(rateLimits.signups);
  const signedIn = requireSession(app);

  /**
   * Runs `attempt`, counting it against the visitor and the email before it starts, so a burst of
   * parallel guesses cannot all slip in ahead of the first failure. The count is given back unless
   * the attempt fails with a wrong password or code.
   */
  async function guarded<T>(c: Context, email: string, attempt: () => Promise<T>): Promise<T> {
    const counted = [
      { limiter: failures, key: `ip:${clientKey(c, trustProxy)}` },
      { limiter: emailFailures, key: `email:${email}` },
    ];
    for (const { limiter, key } of counted) {
      const wait = limiter.blockedFor(key);
      if (wait !== null) tooManyRequests(c, wait);
    }
    for (const { limiter, key } of counted) limiter.hit(key);
    let wrong = false;
    try {
      return await attempt();
    } catch (e) {
      wrong = e instanceof AppError && (e.code === ErrorCode.UNAUTHORIZED || e.code === ErrorCode.WRONG_CREDENTIALS);
      throw e;
    } finally {
      if (!wrong) for (const { limiter, key } of counted) limiter.refund(key);
    }
  }

  return router()
    .get('/session', (c) => {
      const token = readSessionToken(c, secureCookies);
      const session = token ? resolveSession(app, token) : null;
      const firstAccount = !app.accounts.hasAccounts();
      return c.json({
        user: session?.user ?? null,
        signup_open: firstAccount || app.config.signup === 'open',
        first_account: firstAccount,
      });
    })
    .post('/signup', validate('json', SignupInput), async (c) => {
      const result = signups.hit(`ip:${clientKey(c, trustProxy)}`);
      if (!result.allowed) tooManyRequests(c, result.retryAfterS);
      const { user, token } = await signup(app, c.req.valid('json'));
      writeSessionCookie(c, token, secureCookies);
      return c.json({ user }, 201);
    })
    .post('/login', validate('json', LoginInput), async (c) => {
      const input = c.req.valid('json');
      const { user, token } = await guarded(c, input.email, () => login(app, input));
      writeSessionCookie(c, token, secureCookies);
      return c.json({ user });
    })
    .post('/logout', (c) => {
      const token = readSessionToken(c, secureCookies);
      const session = token ? resolveSession(app, token) : null;
      if (session) logout(app, session);
      clearSessionCookie(c, secureCookies);
      return c.json({ ok: true });
    })
    .post('/password', signedIn, validate('json', PasswordChangeInput), async (c) => {
      const session = c.var.session;
      await guarded(c, session.user.email, () => changePassword(app, session, c.req.valid('json')));
      return c.json({ ok: true });
    })
    .post('/mfa/setup', signedIn, (c) => c.json(startMfaSetup(app, c.var.session.user.id)))
    .post('/mfa/enable', signedIn, validate('json', MfaEnableInput), async (c) => {
      const session = c.var.session;
      const user = await guarded(c, session.user.email, async () => enableMfa(app, session, c.req.valid('json').code));
      return c.json({ user });
    })
    .post('/mfa/disable', signedIn, validate('json', MfaDisableInput), async (c) => {
      const session = c.var.session;
      const user = await guarded(c, session.user.email, () => disableMfa(app, session, c.req.valid('json')));
      return c.json({ user });
    });
}
