import type { Database } from '../client.ts';

export interface ApiKey {
  id: string;
  project_id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const COLUMNS = 'id, project_id, name, prefix, created_at, last_used_at, revoked_at';

/** One user's keys. Every query filters by that owner, and a project id the user does not own matches nothing. */
export function createApiKeysRepository(db: Database, userId: string) {
  return {
    list(projectId: string): ApiKey[] {
      return db.all<ApiKey>(`SELECT ${COLUMNS} FROM api_keys WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC`, projectId, userId);
    },
    create(k: { id: string; project_id: string; name: string; prefix: string; hash: string; at: string }): void {
      db.run('INSERT INTO api_keys (id, project_id, user_id, name, prefix, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', k.id, k.project_id, userId, k.name, k.prefix, k.hash, k.at);
    },
    revoke(projectId: string, id: string, at: string): boolean {
      return db.run('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND project_id = ? AND user_id = ? AND revoked_at IS NULL', at, id, projectId, userId).changes === 1;
    },
  };
}
export type ApiKeysRepository = ReturnType<typeof createApiKeysRepository>;

/** The key behind a hash, for authenticating API calls. Revoked keys and keys of deleted projects never match. */
export function findActiveKey(db: Database, hash: string): { id: string; project_id: string; user_id: string; last_used_at: string | null } | undefined {
  return db.get('SELECT id, project_id, user_id, last_used_at FROM api_keys WHERE hash = ? AND revoked_at IS NULL', hash);
}

export function touchKey(db: Database, id: string, at: string): void {
  db.run('UPDATE api_keys SET last_used_at = ? WHERE id = ?', at, id);
}
