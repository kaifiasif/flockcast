import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

/**
 * Thin, typed wrapper over node:sqlite.
 *
 * Only repositories talk to this. It knows nothing about tables: it runs parameterised SQL,
 * returns raw rows, and wraps work in transactions. Mapping rows to domain types is the
 * repository's job, so every JSON column and boolean is decoded explicitly where it is read.
 */
export type SqlParam = SQLInputValue | boolean | undefined;
export type RawRow = Record<string, unknown>;

export interface Database {
  all<T = RawRow>(sql: string, ...params: SqlParam[]): T[];
  get<T = RawRow>(sql: string, ...params: SqlParam[]): T | undefined;
  run(sql: string, ...params: SqlParam[]): { changes: number };
  exec(sql: string): void;
  /** Runs `work` in one transaction. Nested calls join the outer transaction. */
  transaction<T>(work: () => T): T;
  close(): void;
}

const toSql = (value: SqlParam): SQLInputValue => {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
};

export function openDatabase(file: string): Database {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  // WAL: readers never block the writer. foreign_keys is off by default in SQLite.
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
  `);

  const statements = new Map<string, ReturnType<DatabaseSync['prepare']>>();
  const prepare = (sql: string) => {
    let statement = statements.get(sql);
    if (!statement) {
      statement = db.prepare(sql);
      statements.set(sql, statement);
    }
    return statement;
  };
  let depth = 0;

  return {
    all: <T>(sql: string, ...params: SqlParam[]) => prepare(sql).all(...params.map(toSql)) as T[],
    get: <T>(sql: string, ...params: SqlParam[]) => prepare(sql).get(...params.map(toSql)) as T | undefined,
    run: (sql, ...params) => ({ changes: Number(prepare(sql).run(...params.map(toSql)).changes) }),
    exec: (sql) => db.exec(sql),
    transaction(work) {
      if (depth > 0) return work();
      depth++;
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = work();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      } finally {
        depth--;
      }
    },
    close: () => db.close(),
  };
}
