import type { BrandRules } from '../../../engine/index.ts';
import type { Database } from '../client.ts';

export interface Example {
  text: string;
  published_at?: string | null;
}

/** Who you are on a project. The owner made it; the rest were invited. */
export const ROLES = ['owner', 'editor', 'reviewer', 'viewer'] as const;
export type Role = (typeof ROLES)[number];
export type MemberRole = Exclude<Role, 'owner'>;

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
  /** The signed-in user's role here. */
  role: Role;
  /** The owner's plan id; a project's features follow it. */
  owner_plan: string;
  /** Brand rules every rehearsal is checked against, or null. */
  brand: BrandRules | null;
}

interface Row extends Omit<Project, 'examples' | 'brand'> {
  examples_json: string;
  brand_json: string | null;
}

export type ProjectFields = Omit<Project, 'id' | 'created_at' | 'updated_at' | 'role' | 'owner_plan' | 'brand'>;

const COLUMNS = 'id, name, description, platform, handle, audience, examples_json, personas, rounds, created_at, updated_at, brand_json';
const fromRow = ({ examples_json, brand_json, ...r }: Row): Project => ({ ...r, examples: JSON.parse(examples_json) as Example[], brand: brand_json ? (JSON.parse(brand_json) as BrandRules) : null });

// a project the user owns, or one they were added to; nothing else matches
const VISIBLE = `FROM projects p JOIN users o ON o.id = p.user_id LEFT JOIN project_members m ON m.project_id = p.id AND m.user_id = ?
  WHERE (p.user_id = ? OR m.user_id IS NOT NULL)`;
const SELECT = `SELECT ${COLUMNS.split(', ').map((c) => `p.${c}`).join(', ')}, CASE WHEN p.user_id = ? THEN 'owner' ELSE m.role END AS role, o.plan AS owner_plan`;

/**
 * One user's projects: the ones they own and the ones they were invited to, each with their role.
 * Built per signed-in user, so every query filters by that user: anyone else's project id reads as
 * not found. Changing or deleting a project is for its owner only.
 */
export function createProjectsRepository(db: Database, userId: string) {
  return {
    list(): (Project & { rehearsal_count: number; last_rehearsal_at: string | null })[] {
      return db
        .all<Row & { rehearsal_count: number; last_rehearsal_at: string | null }>(
          `${SELECT}, (SELECT COUNT(*) FROM rehearsals r WHERE r.scope = p.id) AS rehearsal_count, (SELECT MAX(created_at) FROM rehearsals r WHERE r.scope = p.id) AS last_rehearsal_at
           ${VISIBLE} ORDER BY p.created_at DESC`,
          userId, userId, userId,
        )
        .map((r) => ({ ...fromRow(r), rehearsal_count: r.rehearsal_count, last_rehearsal_at: r.last_rehearsal_at }));
    },
    find(id: string): Project | undefined {
      const r = db.get<Row>(`${SELECT} ${VISIBLE} AND p.id = ?`, userId, userId, userId, id);
      return r ? fromRow(r) : undefined;
    },
    /** Projects this user owns, for the plan's project cap. */
    ownedCount(): number {
      return db.get<{ n: number }>('SELECT COUNT(*) AS n FROM projects WHERE user_id = ?', userId)?.n ?? 0;
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
    setBrand(id: string, brand: BrandRules | null, at: string): boolean {
      return db.run('UPDATE projects SET brand_json = ?, updated_at = ? WHERE id = ? AND user_id = ?', brand ? JSON.stringify(brand) : null, at, id, userId).changes === 1;
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
