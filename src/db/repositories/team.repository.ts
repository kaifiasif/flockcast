import type { Database } from '../client.ts';
import type { MemberRole, Role } from './projects.repository.ts';

export interface Member {
  user_id: string;
  email: string;
  role: Role;
  added_at: string | null;
}

export interface Invite {
  id: string;
  role: MemberRole;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by_email: string | null;
  revoked_at: string | null;
}

// defence in depth: routes check access first, and every query also keeps to projects this user may see or owns
const SEES = '(SELECT id FROM projects WHERE user_id = ? UNION SELECT project_id FROM project_members WHERE user_id = ?)';
const OWNS = '(SELECT id FROM projects WHERE user_id = ?)';

/** Members and invite links of the projects one user can see. Changes are for the project's owner. */
export function createTeamRepository(db: Database, userId: string) {
  return {
    members(projectId: string): Member[] {
      return db.all<Member>(
        `SELECT * FROM (
           SELECT u.id AS user_id, u.email, 'owner' AS role, NULL AS added_at FROM projects p JOIN users u ON u.id = p.user_id WHERE p.id = ? AND p.id IN ${SEES}
           UNION ALL
           SELECT u.id, u.email, m.role, m.added_at FROM project_members m JOIN users u ON u.id = m.user_id WHERE m.project_id = ? AND m.project_id IN ${SEES}
         ) ORDER BY added_at IS NOT NULL, added_at`,
        projectId, userId, userId, projectId, userId, userId,
      );
    },
    memberCount(projectId: string): number {
      return db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM project_members WHERE project_id = ? AND project_id IN ${OWNS}`, projectId, userId)?.n ?? 0;
    },
    setRole(projectId: string, memberId: string, role: MemberRole): boolean {
      return db.run(`UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ? AND project_id IN ${OWNS}`, role, projectId, memberId, userId).changes === 1;
    },
    /** The owner removes anyone; a member may remove themselves (leave). */
    remove(projectId: string, memberId: string): boolean {
      return (
        db.run(`DELETE FROM project_members WHERE project_id = ? AND user_id = ? AND (project_id IN ${OWNS} OR user_id = ?)`, projectId, memberId, userId, userId).changes === 1
      );
    },
    invites(projectId: string): Invite[] {
      return db.all<Invite>(
        `SELECT i.id, i.role, i.created_at, i.expires_at, i.used_at, u.email AS used_by_email, i.revoked_at FROM project_invites i LEFT JOIN users u ON u.id = i.used_by
         WHERE i.project_id = ? AND i.project_id IN ${OWNS} ORDER BY i.created_at DESC LIMIT 50`,
        projectId, userId,
      );
    },
    createInvite(i: { id: string; project_id: string; role: MemberRole; token_hash: string; at: string; expires_at: string }): boolean {
      return (
        db.run(
          `INSERT INTO project_invites (id, project_id, role, token_hash, created_by, created_at, expires_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE ? IN ${OWNS}`,
          i.id, i.project_id, i.role, i.token_hash, userId, i.at, i.expires_at, i.project_id, userId,
        ).changes === 1
      );
    },
    revokeInvite(projectId: string, id: string, at: string): boolean {
      return db.run(`UPDATE project_invites SET revoked_at = ? WHERE id = ? AND project_id = ? AND used_at IS NULL AND revoked_at IS NULL AND project_id IN ${OWNS}`, at, id, projectId, userId).changes === 1;
    },
    /**
     * Joins through an invite link. The token is the only way in, so this looks it up across projects,
     * and the link works once. Returns the project id, or null when the link is unknown, used, revoked or expired.
     */
    accept(tokenHash: string, at: string): { project_id: string; role: MemberRole } | null {
      const invite = db.get<{ id: string; project_id: string; role: MemberRole; owner: string }>(
        `SELECT i.id, i.project_id, i.role, p.user_id AS owner FROM project_invites i JOIN projects p ON p.id = i.project_id
         WHERE i.token_hash = ? AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?`,
        tokenHash, at,
      );
      if (!invite) return null;
      if (invite.owner === userId) return { project_id: invite.project_id, role: invite.role };
      db.run('UPDATE project_invites SET used_by = ?, used_at = ? WHERE id = ? AND used_at IS NULL', userId, at, invite.id);
      db.run('INSERT INTO project_members (project_id, user_id, role, added_by, added_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (project_id, user_id) DO UPDATE SET role = excluded.role', invite.project_id, userId, invite.role, null, at);
      return { project_id: invite.project_id, role: invite.role };
    },
  };
}
export type TeamRepository = ReturnType<typeof createTeamRepository>;
