-- The engine's table (engine/stores/sqlite.ts), with scope tied to a project so deleting it removes its rehearsals.
CREATE TABLE rehearsals (
  id            TEXT PRIMARY KEY,
  scope         TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  subject       TEXT NOT NULL,
  source        TEXT NOT NULL,
  title         TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('queued', 'preparing', 'running', 'reporting', 'done', 'failed')),
  progress      INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  text_hash     TEXT NOT NULL,
  settings_json TEXT NOT NULL CHECK (json_valid(settings_json)),
  posts_json    TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(posts_json)),
  result_json   TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  state_json    TEXT CHECK (state_json IS NULL OR json_valid(state_json)),
  interviews_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(interviews_json)),
  error         TEXT,
  created_at    TEXT NOT NULL,
  finished_at   TEXT
) STRICT;
CREATE INDEX rehearsals_scope_subject ON rehearsals (scope, subject, created_at);
CREATE INDEX rehearsals_scope_created ON rehearsals (scope, created_at);
