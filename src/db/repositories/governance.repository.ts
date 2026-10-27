import type { Database } from '../client.ts';

export type ApprovalStatus = 'pending' | 'approved' | 'changes_requested' | 'withdrawn';

export interface Approval {
  id: string;
  rehearsal_id: string;
  rehearsal_title: string;
  status: ApprovalStatus;
  note: string;
  requested_by: string;
  requested_by_email: string | null;
  requested_at: string;
  decided_by: string | null;
  decided_by_email: string | null;
  decided_at: string | null;
  comment: string;
}

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  details: Record<string, unknown>;
  at: string;
}

const SEES = '(SELECT id FROM projects WHERE user_id = ? UNION SELECT project_id FROM project_members WHERE user_id = ?)';

const APPROVAL = `SELECT a.id, a.rehearsal_id, r.title AS rehearsal_title, a.status, a.note, a.requested_by, rq.email AS requested_by_email, a.requested_at,
  a.decided_by, dc.email AS decided_by_email, a.decided_at, a.comment
  FROM approvals a JOIN rehearsals r ON r.id = a.rehearsal_id LEFT JOIN users rq ON rq.id = a.requested_by LEFT JOIN users dc ON dc.id = a.decided_by`;

/**
 * Approvals and the audit log for the projects one user can see. Routes decide who may do what by
 * role; these queries also refuse anything outside the user's projects.
 */
export function createGovernanceRepository(db: Database, userId: string) {
  return {
    approvals(projectId: string, status?: ApprovalStatus): Approval[] {
      return db.all<Approval>(
        `${APPROVAL} WHERE a.project_id = ? AND a.project_id IN ${SEES} ${status ? 'AND a.status = ?' : ''} ORDER BY a.requested_at DESC LIMIT 100`,
        ...[projectId, userId, userId, ...(status ? [status] : [])],
      );
    },
    latestApproval(projectId: string, rehearsalId: string): Approval | undefined {
      return db.get<Approval>(`${APPROVAL} WHERE a.project_id = ? AND a.rehearsal_id = ? AND a.project_id IN ${SEES} ORDER BY a.requested_at DESC, a.rowid DESC LIMIT 1`, projectId, rehearsalId, userId, userId);
    },
    requestApproval(a: { id: string; project_id: string; rehearsal_id: string; note: string; at: string }): void {
      // a new request replaces an open one
      db.run(`UPDATE approvals SET status = 'withdrawn' WHERE project_id = ? AND rehearsal_id = ? AND status = 'pending' AND project_id IN ${SEES}`, a.project_id, a.rehearsal_id, userId, userId);
      db.run(
        `INSERT INTO approvals (id, project_id, rehearsal_id, status, note, requested_by, requested_at) SELECT ?, ?, ?, 'pending', ?, ?, ? WHERE ? IN ${SEES}`,
        a.id, a.project_id, a.rehearsal_id, a.note, userId, a.at, a.project_id, userId, userId,
      );
    },
    decide(projectId: string, id: string, status: 'approved' | 'changes_requested', comment: string, at: string): boolean {
      return (
        db.run(
          `UPDATE approvals SET status = ?, comment = ?, decided_by = ?, decided_at = ? WHERE id = ? AND project_id = ? AND status = 'pending' AND requested_by != ? AND project_id IN ${SEES}`,
          status, comment, userId, at, id, projectId, userId, userId, userId,
        ).changes === 1
      );
    },
    withdraw(projectId: string, id: string): boolean {
      return db.run(`UPDATE approvals SET status = 'withdrawn' WHERE id = ? AND project_id = ? AND status = 'pending' AND requested_by = ?`, id, projectId, userId).changes === 1;
    },
    audit(projectId: string, opts: { limit?: number; before?: string } = {}): AuditEvent[] {
      return db
        .all<Omit<AuditEvent, 'details'> & { details_json: string }>(
          `SELECT id, actor, action, target, details_json, at FROM audit_events WHERE project_id = ? AND project_id IN ${SEES} ${opts.before ? 'AND at < ?' : ''} ORDER BY at DESC, rowid DESC LIMIT ?`,
          ...[projectId, userId, userId, ...(opts.before ? [opts.before] : []), opts.limit ?? 100],
        )
        .map(({ details_json, ...e }) => ({ ...e, details: JSON.parse(details_json) as Record<string, unknown> }));
    },
  };
}
export type GovernanceRepository = ReturnType<typeof createGovernanceRepository>;

/** Writes one audit event. Called after the route has checked access; never fails the request. */
export function writeAudit(db: Database, e: { id: string; project_id: string; user_id: string | null; actor: string; action: string; target?: string; details?: Record<string, unknown>; at: string }): void {
  db.run(
    'INSERT INTO audit_events (id, project_id, user_id, actor, action, target, details_json, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    e.id, e.project_id, e.user_id, e.actor.slice(0, 254), e.action, (e.target ?? '').slice(0, 200), JSON.stringify(e.details ?? {}), e.at,
  );
}

/** Rehearsals this owner's projects started since a date, for the plan's monthly cap. */
export function rehearsalsSince(db: Database, ownerId: string, sinceIso: string): number {
  return db.get<{ n: number }>('SELECT COUNT(*) AS n FROM rehearsals r JOIN projects p ON p.id = r.scope WHERE p.user_id = ? AND r.created_at >= ?', ownerId, sinceIso)?.n ?? 0;
}
