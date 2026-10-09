import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from './client.ts';

const MIGRATIONS_DIR = join(import.meta.dirname, 'migrations');

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * Migrations are numbered SQL files, applied once each, in order, each in its own transaction.
 * A migration that rebuilds a referenced table starts with `-- migrate: foreign_keys=off`: SQLite
 * can only switch foreign keys off outside a transaction, and with them on, dropping the old table
 * would cascade-delete its children. Such a migration is checked with foreign_key_check before it
 * commits, so it cannot leave a dangling reference behind.
 */
export function loadMigrations(dir = MIGRATIONS_DIR): Migration[] {
  return readdirSync(dir)
    .filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f))
    .sort()
    .map((file) => ({ version: Number(file.slice(0, 4)), name: file.replace(/\.sql$/, ''), sql: readFileSync(join(dir, file), 'utf8') }));
}

export function migrate(db: Database, migrations = loadMigrations()): { applied: string[] } {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL
  ) STRICT`);

  const done = new Set(db.all<{ version: number }>('SELECT version FROM schema_migrations').map((r) => r.version));
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.version)) continue;
    const rebuildsTables = /^-- migrate: foreign_keys=off\s*$/m.test(m.sql.split('\n', 1)[0] ?? '');
    if (rebuildsTables) db.exec('PRAGMA foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(m.sql);
        if (rebuildsTables) {
          const broken = db.all('PRAGMA foreign_key_check');
          if (broken.length) throw new Error(`Migration ${m.name} left ${broken.length} broken references: ${JSON.stringify(broken.slice(0, 3))}`);
        }
        db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', m.version, m.name, new Date().toISOString());
      });
    } finally {
      if (rebuildsTables) db.exec('PRAGMA foreign_keys = ON');
    }
    applied.push(m.name);
  }
  return { applied };
}
