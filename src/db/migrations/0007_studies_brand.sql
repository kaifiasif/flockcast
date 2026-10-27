-- Studies (engine/research/store.ts): focus groups, message tests and crisis rehearsals, removed with their project.
CREATE TABLE studies (
  id          TEXT PRIMARY KEY,
  scope       TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('focus_group', 'message_test', 'crisis')),
  title       TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('queued', 'preparing', 'running', 'reporting', 'done', 'failed')),
  progress    INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  input_json  TEXT NOT NULL CHECK (json_valid(input_json)),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  error       TEXT,
  created_at  TEXT NOT NULL,
  finished_at TEXT
) STRICT;
CREATE INDEX studies_scope_created ON studies (scope, created_at);

-- A project's brand rules: voice, banned words, required lines. Checked on every rehearsal when set.
ALTER TABLE projects ADD COLUMN brand_json TEXT CHECK (brand_json IS NULL OR json_valid(brand_json));
