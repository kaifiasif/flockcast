import type { Database } from '../client.ts';

export interface Example {
  text: string;
  published_at?: string | null;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  platform: string;
  handle: string;
  audience: string | null;
  examples: Example[];
  personas: number;
  rounds: number;
  created_at: string;
  updated_at: string;
}

interface Row extends Omit<Project, 'examples'> {
  examples_json: string;
}

export type ProjectFields = Omit<Project, 'id' | 'created_at' | 'updated_at'>;

const COLUMNS = 'id, name, description, platform, handle, audience, examples_json, personas, rounds, created_at, updated_at';
const fromRow = ({ examples_json, ...r }: Row): Project => ({ ...r, examples: JSON.parse(examples_json) as Example[] });

/**
 * One user's projects. Built per signed-in user, so every query filters by that owner: someone
 * else's project id reads as not found.
 */
export function createProjectsRepository(db: Database, userId: string) {
  return {
    list(): (Project & { rehearsal_count: number; last_rehearsal_at: string | null })[] {
      return db
        .all<Row & { rehearsal_count: number; last_rehearsal_at: string | null }>(
          `SELECT ${COLUMNS.split(', ').map((c) => `p.${c}`).join(', ')}, COUNT(r.id) AS rehearsal_count, MAX(r.created_at) AS last_rehearsal_at
           FROM projects p LEFT JOIN rehearsals r ON r.scope = p.id
           WHERE p.user_id = ? GROUP BY p.id ORDER BY p.created_at DESC`,
          userId,
        )
        .map((r) => ({ ...fromRow(r), rehearsal_count: r.rehearsal_count, last_rehearsal_at: r.last_rehearsal_at }));
    },
    find(id: string): Project | undefined {
      const r = db.get<Row>(`SELECT ${COLUMNS} FROM projects WHERE id = ? AND user_id = ?`, id, userId);
      return r ? fromRow(r) : undefined;
    },
    create(p: ProjectFields & { id: string; at: string }): void {
      db.run(
        `INSERT INTO projects (id, user_id, name, description, platform, handle, audience, examples_json, personas, rounds, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        p.id, userId, p.name, p.description, p.platform, p.handle, p.audience, JSON.stringify(p.examples), p.personas, p.rounds, p.at, p.at,
      );
    },
    update(id: string, p: ProjectFields, at: string): boolean {
      const { changes } = db.run(
        `UPDATE projects SET name = ?, description = ?, platform = ?, handle = ?, audience = ?, examples_json = ?, personas = ?, rounds = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
        p.name, p.description, p.platform, p.handle, p.audience, JSON.stringify(p.examples), p.personas, p.rounds, at, id, userId,
      );
      return changes === 1;
    },
    remove(id: string): boolean {
      return db.run('DELETE FROM projects WHERE id = ? AND user_id = ?', id, userId).changes === 1;
    },
  };
}
export type ProjectsRepository = ReturnType<typeof createProjectsRepository>;

/** Project settings by id with no owner check, for the engine's text source. Callers check the owner first. */
export function projectExamples(db: Database, projectId: string): Example[] {
  const r = db.get<{ examples_json: string }>('SELECT examples_json FROM projects WHERE id = ?', projectId);
  return r ? (JSON.parse(r.examples_json) as Example[]) : [];
}
