-- The launch advisor's table (engine/advisor/store.ts), with scope tied to a project so deleting it removes its advice.
CREATE TABLE advice (
  id          TEXT PRIMARY KEY,
  scope       TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('queued', 'researching', 'simulating', 'deciding', 'done', 'failed')),
  progress    INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  input_json  TEXT NOT NULL CHECK (json_valid(input_json)),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  error       TEXT,
  created_at  TEXT NOT NULL,
  finished_at TEXT
) STRICT;
CREATE INDEX advice_scope_created ON advice (scope, created_at);
