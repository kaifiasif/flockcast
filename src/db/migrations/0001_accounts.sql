-- Accounts: email + scrypt password, optional TOTP 2-step codes, and opaque sessions.
CREATE TABLE users (
  id                  TEXT PRIMARY KEY,
  email               TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(email) BETWEEN 3 AND 254 AND email = lower(trim(email)) AND email LIKE '%_@_%'),
  password_hash       TEXT NOT NULL,
  totp_secret         TEXT,
  totp_pending        TEXT,
  totp_last_step      INTEGER,
  created_at          TEXT NOT NULL,
  password_changed_at TEXT
) STRICT;

CREATE TABLE sessions (
  -- sha256 of the cookie value; the cookie itself is never stored
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  CHECK (expires_at > created_at)
) STRICT;
CREATE INDEX sessions_user ON sessions (user_id);
CREATE INDEX sessions_expires ON sessions (expires_at);
