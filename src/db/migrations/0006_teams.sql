-- Plans, teams and the controls larger customers ask for: members with roles, invite links,
-- approvals with the rehearsal attached, an audit log and signed webhooks.

ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'creator', 'studio', 'enterprise'));

-- The owner stays projects.user_id; everyone else who can see a project is listed here.
CREATE TABLE project_members (
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('editor', 'reviewer', 'viewer')),
  added_by   TEXT REFERENCES users (id) ON DELETE SET NULL,
  added_at   TEXT NOT NULL,
  PRIMARY KEY (project_id, user_id)
) STRICT;
CREATE INDEX project_members_user ON project_members (user_id);

-- Invite links carry a random token; only its sha256 is kept.
CREATE TABLE project_invites (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('editor', 'reviewer', 'viewer')),
  token_hash  TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  created_by  TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  used_by     TEXT REFERENCES users (id) ON DELETE SET NULL,
  used_at     TEXT,
  revoked_at  TEXT
) STRICT;
CREATE INDEX project_invites_project ON project_invites (project_id, created_at);

CREATE TABLE approvals (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  rehearsal_id  TEXT NOT NULL REFERENCES rehearsals (id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'changes_requested', 'withdrawn')),
  note          TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  requested_by  TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  requested_at  TEXT NOT NULL,
  decided_by    TEXT REFERENCES users (id) ON DELETE SET NULL,
  decided_at    TEXT,
  comment       TEXT NOT NULL DEFAULT '' CHECK (length(comment) <= 1000)
) STRICT;
CREATE INDEX approvals_project ON approvals (project_id, status, requested_at);
CREATE INDEX approvals_rehearsal ON approvals (rehearsal_id, requested_at);

CREATE TABLE audit_events (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id     TEXT REFERENCES users (id) ON DELETE SET NULL,
  actor       TEXT NOT NULL CHECK (length(actor) BETWEEN 1 AND 254),
  action      TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 60),
  target      TEXT NOT NULL DEFAULT '' CHECK (length(target) <= 200),
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json)),
  at          TEXT NOT NULL
) STRICT;
CREATE INDEX audit_events_project ON audit_events (project_id, at);

-- The secret signs deliveries, so it has to be kept as is; it is shown once and never returned again.
CREATE TABLE webhooks (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  url         TEXT NOT NULL CHECK (length(url) BETWEEN 8 AND 500),
  secret      TEXT NOT NULL CHECK (length(secret) >= 32),
  events_json TEXT NOT NULL CHECK (json_valid(events_json) AND json_type(events_json) = 'array'),
  created_at  TEXT NOT NULL,
  last_at     TEXT,
  last_status INTEGER,
  last_error  TEXT
) STRICT;
CREATE INDEX webhooks_project ON webhooks (project_id);
