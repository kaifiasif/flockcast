import type { AppServices } from '../../context.ts';
import { AppError, conflict, ErrorCode } from '../../core/errors.ts';
import type { Account } from '../../db/repositories/accounts.repository.ts';
import { nowIso, uuidv7 } from '../../domain/ids.ts';
import { burnPasswordCheck, hashPassword, verifyPassword } from './passwords.ts';
import { newSessionToken, SESSION_TTL_MS, sessionId } from './session-cookie.ts';
import { newTotpSecret, otpauthUri, verifyTotp } from './totp.ts';

export interface PublicUser {
  id: string;
  email: string;
  mfa_enabled: boolean;
  created_at: string;
}

export interface Session {
  id: string;
  user: PublicUser;
}

const toPublic = (a: Account): PublicUser => ({ id: a.id, email: a.email, mfa_enabled: a.totp_secret !== null, created_at: a.created_at });

/** One message for "no such account" and "wrong password", so log-in cannot be used to find accounts. */
const wrongCredentials = () => new AppError(401, ErrorCode.UNAUTHORIZED, 'That email and password do not match an account.');
const CODE_MISMATCH = 'That code did not match. Use the newest code from your authenticator app.';
/** Signed in already, so 400 rather than 401: the session is fine, the re-entered secret is not. */
const wrongSecret = (message: string, field: string) =>
  new AppError(400, ErrorCode.WRONG_CREDENTIALS, message, { fields: [{ path: field, message }] });

/** last_seen_at is written at most this often, so reads do not turn into writes. */
const TOUCH_EVERY_MS = 60 * 60 * 1000;

function startSession(app: AppServices, userId: string): string {
  const token = newSessionToken();
  const now = Date.now();
  app.accounts.createSession({
    id: sessionId(token),
    user_id: userId,
    created_at: new Date(now).toISOString(),
    last_seen_at: new Date(now).toISOString(),
    expires_at: new Date(now + SESSION_TTL_MS).toISOString(),
  });
  return token;
}

function requireAccount(app: AppServices, userId: string): Account {
  const account = app.accounts.findById(userId);
  if (!account) throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Log in to continue.');
  return account;
}

/** A code is good once: replaying one seen over someone's shoulder fails. */
function checkCode(app: AppServices, account: Account, secret: string, code: string, onMismatch: () => AppError): void {
  const step = verifyTotp(secret, code);
  if (step === null || !app.accounts.useTotpStep(account.id, step)) throw onMismatch();
}

/** Closed sign-up still lets the owner in: the owner email if one is set, otherwise whoever is first. */
const signupAllowed = (app: AppServices, email: string) =>
  app.config.signup === 'open' || (app.config.ownerEmail ? app.config.ownerEmail === email : !app.accounts.hasAccounts());

/** Creates an account and logs it in. Each account sees only its own projects. */
export async function signup(app: AppServices, input: { email: string; password: string }): Promise<{ user: PublicUser; token: string }> {
  if (!signupAllowed(app, input.email)) {
    throw new AppError(403, ErrorCode.SIGNUP_CLOSED, 'New accounts are turned off on this server. Ask its owner for access.');
  }
  if (app.accounts.findByEmail(input.email)) {
    throw conflict('An account with this email already exists. Log in instead.', undefined, ErrorCode.ACCOUNT_EXISTS);
  }
  const passwordHash = await hashPassword(input.password);
  const at = nowIso();
  const userId = app.db.transaction(() => {
    if (app.accounts.findByEmail(input.email)) {
      throw conflict('An account with this email already exists. Log in instead.', undefined, ErrorCode.ACCOUNT_EXISTS);
    }
    const id = uuidv7();
    app.accounts.create({ id, email: input.email, password_hash: passwordHash, created_at: at });
    return id;
  });
  app.log.info('account_created', { user_id: userId });
  return { user: toPublic(requireAccount(app, userId)), token: startSession(app, userId) };
}

export async function login(app: AppServices, input: { email: string; password: string; code?: string | undefined }): Promise<{ user: PublicUser; token: string }> {
  const account = app.accounts.findByEmail(input.email);
  if (!account) {
    await burnPasswordCheck(input.password);
    throw wrongCredentials();
  }
  if (!(await verifyPassword(input.password, account.password_hash))) throw wrongCredentials();
  if (account.totp_secret) {
    if (!input.code) throw new AppError(401, ErrorCode.MFA_REQUIRED, 'Enter the 6-digit code from your authenticator app.');
    checkCode(app, account, account.totp_secret, input.code, () => new AppError(401, ErrorCode.UNAUTHORIZED, CODE_MISMATCH));
  }
  return { user: toPublic(account), token: startSession(app, account.id) };
}

export function logout(app: AppServices, session: Session): void {
  app.accounts.deleteSession(session.id);
}

/** The session behind a cookie, or null if it is unknown, expired or its account is gone. */
export function resolveSession(app: AppServices, token: string): Session | null {
  const id = sessionId(token);
  const row = app.accounts.findSession(id);
  if (!row) return null;
  const now = Date.now();
  if (Date.parse(row.expires_at) <= now) {
    app.accounts.deleteSession(id);
    return null;
  }
  const account = app.accounts.findById(row.user_id);
  if (!account) return null;
  if (now - Date.parse(row.last_seen_at) > TOUCH_EVERY_MS) app.accounts.touchSession(id, new Date(now).toISOString());
  return { id, user: toPublic(account) };
}

/** Changing the password signs out every other device. */
export async function changePassword(app: AppServices, session: Session, input: { current_password: string; new_password: string }): Promise<void> {
  const account = requireAccount(app, session.user.id);
  if (!(await verifyPassword(input.current_password, account.password_hash))) {
    throw wrongSecret('Your current password is not right.', 'current_password');
  }
  app.accounts.setPassword(account.id, await hashPassword(input.new_password), nowIso());
  app.accounts.deleteOtherSessions(account.id, session.id);
}

/** Step 1 of turning on 2-step codes: a new secret, kept pending until a code proves the app has it. */
export function startMfaSetup(app: AppServices, userId: string): { secret: string; otpauth_uri: string } {
  const account = requireAccount(app, userId);
  if (account.totp_secret) throw conflict('2-step codes are already on. Turn them off first to move to a new app.');
  const secret = newTotpSecret();
  app.accounts.setTotpPending(account.id, secret);
  return { secret, otpauth_uri: otpauthUri(secret, account.email) };
}

/** Turning codes on or off signs out every other device, as a password change does. */
export function enableMfa(app: AppServices, session: Session, code: string): PublicUser {
  const userId = session.user.id;
  const account = requireAccount(app, userId);
  if (!account.totp_pending) throw conflict('Start the setup first, then enter a code from your app.');
  const step = verifyTotp(account.totp_pending, code);
  if (step === null) throw wrongSecret(CODE_MISMATCH, 'code');
  app.accounts.enableTotp(account.id, step);
  app.accounts.deleteOtherSessions(account.id, session.id);
  return toPublic(requireAccount(app, userId));
}

export async function disableMfa(app: AppServices, session: Session, input: { password: string; code: string }): Promise<PublicUser> {
  const userId = session.user.id;
  const account = requireAccount(app, userId);
  if (!account.totp_secret) throw conflict('2-step codes are already off.');
  if (!(await verifyPassword(input.password, account.password_hash))) throw wrongSecret('Your password is not right.', 'password');
  checkCode(app, account, account.totp_secret, input.code, () => wrongSecret(CODE_MISMATCH, 'code'));
  app.accounts.disableTotp(account.id);
  app.accounts.deleteOtherSessions(account.id, session.id);
  return toPublic(requireAccount(app, userId));
}

/** Expired sessions are deleted on boot and then hourly. */
export function sweepSessions(app: AppServices): number {
  return app.accounts.deleteExpiredSessions(nowIso());
}
