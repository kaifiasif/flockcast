/**
 * Rehearsals in SQLite, through any wrapper with get/all/run (this app's fits, and
 * so does a thin wrapper over node:sqlite or better-sqlite3). Every query is bounded by scope.
 */
import type { Store, StoredRehearsal } from '../types.ts';

export interface SqlDb {
  get<T = unknown>(sql: string, ...params: unknown[]): T | undefined;
  all<T = unknown>(sql: string, ...params: unknown[]): T[];
  run(sql: string, ...params: unknown[]): { changes: number | bigint };
}

const DEFAULT_TABLE = 'rehearsals';
const tableName = (t = DEFAULT_TABLE) => {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(t)) throw new Error(`Table name "${t}" must be lowercase letters, digits and underscores.`);
  return t;
};

/**
 * The table. Apps with their own migrations copy this into one (as this app's 0003 does);
 * `ensureRehearsalsTable` is for apps without a migration system. Apps that already have a table
 * called "rehearsals" pass another name, such as "flockcast_rehearsals".
 */
export const rehearsalsSql = (table = DEFAULT_TABLE) => `
CREATE TABLE IF NOT EXISTS ${table} (
  id            TEXT PRIMARY KEY,
  scope         TEXT NOT NULL,
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
  finished_at   TEXT,
  group_id      TEXT,
  variant       TEXT CHECK (variant IS NULL OR variant IN ('A', 'B', 'C')),
  outcome_json  TEXT CHECK (outcome_json IS NULL OR json_valid(outcome_json))
) STRICT;
CREATE INDEX IF NOT EXISTS ${table}_scope_group ON ${table} (scope, group_id);
CREATE INDEX IF NOT EXISTS ${table}_scope_subject ON ${table} (scope, subject, created_at);
CREATE INDEX IF NOT EXISTS ${table}_scope_created ON ${table} (scope, created_at);
`;
export const REHEARSALS_SQL = rehearsalsSql();

interface Row {
  id: string;
  scope: string;
  subject: string;
  source: string;
  title: string;
  status: StoredRehearsal['status'];
  progress: number;
  text_hash: string;
  settings_json: string;
  posts_json: string;
  result_json: string | null;
  state_json: string | null;
  interviews_json: string;
  error: string | null;
  created_at: string;
  finished_at: string | null;
  group_id: string | null;
  variant: string | null;
  outcome_json: string | null;
}

const parse = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

const fromRow = (r: Row): StoredRehearsal => ({
  id: r.id,
  scope: r.scope,
  subject: r.subject,
  source: r.source,
  title: r.title,
  status: r.status,
  progress: r.progress,
  text_hash: r.text_hash,
  settings: parse(r.settings_json, {} as StoredRehearsal['settings']),
  posts: parse(r.posts_json, []),
  result: parse(r.result_json, null),
  state: parse(r.state_json, null),
  interviews: parse(r.interviews_json, []),
  error: r.error,
  created_at: r.created_at,
  finished_at: r.finished_at,
  group_id: r.group_id,
  variant: r.variant,
  outcome: parse(r.outcome_json, null),
});

/** Columns a patch may change, and how each is stored. Anything else in a patch is ignored. */
const COLUMNS: Record<string, [string, (v: unknown) => unknown]> = {
  status: ['status', (v) => v],
  progress: ['progress', (v) => Math.round(Number(v))],
  title: ['title', (v) => v],
  result: ['result_json', (v) => (v == null ? null : JSON.stringify(v))],
  state: ['state_json', (v) => (v == null ? null : JSON.stringify(v))],
  interviews: ['interviews_json', (v) => JSON.stringify(v ?? [])],
  error: ['error', (v) => v ?? null],
  finished_at: ['finished_at', (v) => v ?? null],
  outcome: ['outcome_json', (v) => (v == null ? null : JSON.stringify(v))],
};

const FIELDS = 'id, scope, subject, source, title, status, progress, text_hash, settings_json, posts_json, result_json, state_json, interviews_json, error, created_at, finished_at, group_id, variant, outcome_json';

export function sqliteStore(db: SqlDb, { table }: { table?: string } = {}): Store {
  const t = tableName(table);
  const SELECT = `SELECT ${FIELDS} FROM ${t}`;
  // lists leave out the engine's memory, which can be large and is only needed to answer questions
  const LIST = `SELECT ${FIELDS.replace('state_json', 'NULL AS state_json')} FROM ${t}`;
  return {
    insert(r) {
      db.run(
        `INSERT INTO ${t} (${FIELDS})
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        r.id, r.scope, r.subject, r.source, r.title, r.status, r.progress, r.text_hash, JSON.stringify(r.settings), JSON.stringify(r.posts),
        r.result == null ? null : JSON.stringify(r.result), r.state == null ? null : JSON.stringify(r.state), JSON.stringify(r.interviews), r.error, r.created_at, r.finished_at,
        r.group_id ?? null, r.variant ?? null, r.outcome == null ? null : JSON.stringify(r.outcome),
      );
    },
    update(scope, id, patch) {
      const sets: string[] = [];
      const values: unknown[] = [];
      for (const [k, v] of Object.entries(patch)) {
        const col = COLUMNS[k];
        if (!col) continue;
        sets.push(`${col[0]} = ?`);
        values.push(col[1](v));
      }
      if (sets.length) db.run(`UPDATE ${t} SET ${sets.join(', ')} WHERE scope = ? AND id = ?`, ...values, scope, id);
    },
    get(scope, id) {
      const r = db.get<Row>(`${SELECT} WHERE scope = ? AND id = ?`, scope, id);
      return r ? fromRow(r) : undefined;
    },
    latest(scope, subject) {
      const r = db.get<Row>(`${SELECT} WHERE scope = ? AND subject = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`, scope, subject);
      return r ? fromRow(r) : undefined;
    },
    list(scope, { subject, group, limit = 50 } = {}) {
      const where = ['scope = ?'];
      const params: unknown[] = [scope];
      if (subject) where.push('subject = ?'), params.push(subject);
      if (group) where.push('group_id = ?'), params.push(group);
      return db.all<Row>(`${LIST} WHERE ${where.join(' AND ')} ORDER BY created_at DESC, rowid DESC LIMIT ?`, ...params, limit).map(fromRow);
    },
    countSince(scope, subject, sinceIso) {
      return db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t} WHERE scope = ? AND subject = ? AND created_at > ?`, scope, subject, sinceIso)?.n ?? 0;
    },
    remove(scope, id) {
      return Number(db.run(`DELETE FROM ${t} WHERE scope = ? AND id = ?`, scope, id).changes) > 0;
    },
    failStale(at) {
      return Number(
        db.run(`UPDATE ${t} SET status = 'failed', error = 'Interrupted by a server restart. Run it again.', finished_at = ? WHERE status IN ('queued', 'preparing', 'running', 'reporting')`, at).changes,
      );
    },
  };
}

/** For apps with no migrations: creates the table if it is missing. */
export function ensureRehearsalsTable(db: { exec(sql: string): void }, { table }: { table?: string } = {}): void {
  const t = tableName(table);
  // tables made before comparisons and outcomes existed get the new columns; a duplicate column just throws
  for (const col of ['group_id TEXT', "variant TEXT CHECK (variant IS NULL OR variant IN ('A', 'B', 'C'))", 'outcome_json TEXT CHECK (outcome_json IS NULL OR json_valid(outcome_json))']) {
    try {
      db.exec(`ALTER TABLE ${t} ADD COLUMN ${col}`);
    } catch {
      // already there, or the table is new and gets it below
    }
  }
  db.exec(rehearsalsSql(t));
}
