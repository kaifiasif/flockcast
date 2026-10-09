-- A project is one audience setup: where the posts go, who reads them, and how they were written before.
CREATE TABLE projects (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  description   TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  platform      TEXT NOT NULL CHECK (platform IN ('x', 'linkedin', 'threads', 'bluesky', 'reddit', 'generic')),
  handle        TEXT NOT NULL CHECK (length(handle) BETWEEN 1 AND 60),
  audience      TEXT CHECK (audience IS NULL OR length(audience) <= 2000),
  examples_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(examples_json) AND json_type(examples_json) = 'array' AND json_array_length(examples_json) <= 25),
  personas      INTEGER NOT NULL CHECK (personas BETWEEN 2 AND 30),
  rounds        INTEGER NOT NULL CHECK (rounds BETWEEN 1 AND 40),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  -- lets child tables check that a row and its project belong to the same user
  UNIQUE (id, user_id)
) STRICT;
CREATE INDEX projects_user ON projects (user_id, created_at);

-- Keys for apps that call the API (Creator OS, scripts). Each works for one project only.
CREATE TABLE api_keys (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  name         TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  -- first characters, shown so people can tell keys apart; the rest is never stored
  prefix       TEXT NOT NULL,
  -- sha256 of the whole key
  hash         TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at   TEXT,
  FOREIGN KEY (project_id, user_id) REFERENCES projects (id, user_id) ON DELETE CASCADE
) STRICT;
CREATE INDEX api_keys_project ON api_keys (project_id);
