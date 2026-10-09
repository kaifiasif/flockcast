/** Advisor runs in SQLite or in memory. Every query is bounded by scope, as rehearsals are. */
import type { SqlDb } from '../stores/sqlite.ts';
import type { Advice, AdviceStore } from './types.ts';

export const ADVICE_SQL = `
CREATE TABLE IF NOT EXISTS advice (
  id          TEXT PRIMARY KEY,
  scope       TEXT NOT NULL,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('queued', 'researching', 'simulating', 'deciding', 'done', 'failed')),
  progress    INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  input_json  TEXT NOT NULL CHECK (json_valid(input_json)),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  error       TEXT,
  created_at  TEXT NOT NULL,
  finished_at TEXT
) STRICT;
CREATE INDEX IF NOT EXISTS advice_scope_created ON advice (scope, created_at);
`;

interface Row {
  id: string;
  scope: string;
  title: string;
  status: Advice['status'];
  progress: number;
  input_json: string;
  result_json: string | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

const parse = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

const fromRow = (r: Row): Advice => ({
  id: r.id,
  scope: r.scope,
  title: r.title,
  status: r.status,
  progress: r.progress,
  input: parse(r.input_json, {} as Advice['input']),
  result: parse(r.result_json, null),
  error: r.error,
  created_at: r.created_at,
  finished_at: r.finished_at,
});

const COLUMNS: Record<string, [string, (v: unknown) => unknown]> = {
  status: ['status', (v) => v],
  progress: ['progress', (v) => Math.round(Number(v))],
  result: ['result_json', (v) => (v == null ? null : JSON.stringify(v))],
  error: ['error', (v) => v ?? null],
  finished_at: ['finished_at', (v) => v ?? null],
};

const FIELDS = 'id, scope, title, status, progress, input_json, result_json, error, created_at, finished_at';
const ACTIVE_SQL = `('queued', 'researching', 'simulating', 'deciding')`;

export function sqliteAdviceStore(db: SqlDb): AdviceStore {
  return {
    insert(r) {
      db.run(`INSERT INTO advice (${FIELDS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, r.id, r.scope, r.title, r.status, r.progress, JSON.stringify(r.input), r.result == null ? null : JSON.stringify(r.result), r.error, r.created_at, r.finished_at);
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
      if (sets.length) db.run(`UPDATE advice SET ${sets.join(', ')} WHERE scope = ? AND id = ?`, ...values, scope, id);
    },
    get(scope, id) {
      const r = db.get<Row>(`SELECT ${FIELDS} FROM advice WHERE scope = ? AND id = ?`, scope, id);
      return r ? fromRow(r) : undefined;
    },
    list(scope, { limit = 50 } = {}) {
      // lists leave out the full result, which carries every finding and buyer
      return db.all<Row>(`SELECT ${FIELDS.replace('result_json', 'NULL AS result_json')} FROM advice WHERE scope = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`, scope, limit).map(fromRow);
    },
    countSince(scope, sinceIso) {
      return db.get<{ n: number }>('SELECT COUNT(*) AS n FROM advice WHERE scope = ? AND created_at > ?', scope, sinceIso)?.n ?? 0;
    },
    remove(scope, id) {
      return Number(db.run('DELETE FROM advice WHERE scope = ? AND id = ?', scope, id).changes) > 0;
    },
    failStale(at) {
      return Number(db.run(`UPDATE advice SET status = 'failed', error = 'Interrupted by a server restart. Run it again.', finished_at = ? WHERE status IN ${ACTIVE_SQL}`, at).changes);
    },
  };
}

export function memoryAdviceStore(): AdviceStore {
  const rows = new Map<string, Advice>();
  const ACTIVE = new Set(['queued', 'researching', 'simulating', 'deciding']);
  const own = (scope: string, id: string) => {
    const r = rows.get(id);
    return r && r.scope === scope ? r : undefined;
  };
  return {
    insert(r) {
      rows.set(r.id, structuredClone(r));
    },
    update(scope, id, patch) {
      const r = own(scope, id);
      if (r) rows.set(id, { ...r, ...structuredClone(patch), id: r.id, scope: r.scope });
    },
    get(scope, id) {
      const r = own(scope, id);
      return r && structuredClone(r);
    },
    list(scope, { limit = 50 } = {}) {
      return [...rows.values()].filter((r) => r.scope === scope).reverse().slice(0, limit).map((r) => ({ ...structuredClone(r), result: null }));
    },
    countSince(scope, sinceIso) {
      return [...rows.values()].filter((r) => r.scope === scope && r.created_at > sinceIso).length;
    },
    remove(scope, id) {
      return own(scope, id) ? rows.delete(id) : false;
    },
    failStale(at) {
      let n = 0;
      for (const r of rows.values()) {
        if (!ACTIVE.has(r.status)) continue;
        Object.assign(r, { status: 'failed', error: 'Interrupted by a server restart. Run it again.', finished_at: at });
        n++;
      }
      return n;
    },
  };
}
