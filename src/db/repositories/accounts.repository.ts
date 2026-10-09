import type { Database } from '../client.ts';

export interface Account {
  id: string;
  email: string;
  password_hash: string;
  totp_secret: string | null;
  totp_pending: string | null;
  totp_last_step: number | null;
  created_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
}

/** Users and sessions. Not scoped to a user: this is what establishes who the user is. */
export function createAccountsRepository(db: Database) {
  const ACCOUNT = 'SELECT id, email, password_hash, totp_secret, totp_pending, totp_last_step, created_at FROM users';
  return {
    findByEmail(email: string): Account | undefined {
      return db.get<Account>(`${ACCOUNT} WHERE email = ?`, email);
    },
    findById(id: string): Account | undefined {
      return db.get<Account>(`${ACCOUNT} WHERE id = ?`, id);
    },
    hasAccounts(): boolean {
      return Boolean(db.get('SELECT 1 FROM users WHERE email IS NOT NULL LIMIT 1'));
    },
    create(a: { id: string; email: string; password_hash: string; created_at: string }): void {
      db.run('INSERT INTO users (id, email, password_hash, created_at, password_changed_at) VALUES (?, ?, ?, ?, ?)', a.id, a.email, a.password_hash, a.created_at, a.created_at);
    },
    setPassword(id: string, hash: string, at: string): void {
      db.run('UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?', hash, at, id);
    },
    setTotpPending(id: string, secret: string | null): void {
      db.run('UPDATE users SET totp_pending = ? WHERE id = ?', secret, id);
    },
    enableTotp(id: string, step: number): void {
      db.run('UPDATE users SET totp_secret = totp_pending, totp_pending = NULL, totp_last_step = ? WHERE id = ? AND totp_pending IS NOT NULL', step, id);
    },
    disableTotp(id: string): void {
      db.run('UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_last_step = NULL WHERE id = ?', id);
    },
    /** Records a used code's time step; false if it (or a later one) was already used. */
    useTotpStep(id: string, step: number): boolean {
      const { changes } = db.run('UPDATE users SET totp_last_step = ? WHERE id = ? AND (totp_last_step IS NULL OR totp_last_step < ?)', step, id, step);
      return changes === 1;
    },

    // ------------------------------------------------------------ sessions
    createSession(s: SessionRow): void {
      db.run(
        'INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)',
        s.id, s.user_id, s.created_at, s.last_seen_at, s.expires_at,
      );
    },
    findSession(id: string): SessionRow | undefined {
      return db.get<SessionRow>('SELECT id, user_id, created_at, last_seen_at, expires_at FROM sessions WHERE id = ?', id);
    },
    touchSession(id: string, at: string): void {
      db.run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', at, id);
    },
    deleteSession(id: string): void {
      db.run('DELETE FROM sessions WHERE id = ?', id);
    },
    deleteOtherSessions(userId: string, keepId: string): void {
      db.run('DELETE FROM sessions WHERE user_id = ? AND id <> ?', userId, keepId);
    },
    deleteExpiredSessions(now: string): number {
      return db.run('DELETE FROM sessions WHERE expires_at <= ?', now).changes;
    },
  };
}
export type AccountsRepository = ReturnType<typeof createAccountsRepository>;
