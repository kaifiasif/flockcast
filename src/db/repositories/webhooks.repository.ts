import type { Database } from '../client.ts';

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  created_at: string;
  last_at: string | null;
  last_status: number | null;
  last_error: string | null;
}

interface Row extends Omit<Webhook, 'events'> {
  events_json: string;
}
const fromRow = ({ events_json, ...r }: Row): Webhook => ({ ...r, events: JSON.parse(events_json) as string[] });
const OWNS = '(SELECT id FROM projects WHERE user_id = ?)';

/** Webhooks of the projects one user owns. The secret goes in on create and never comes back out. */
export function createWebhooksRepository(db: Database, userId: string) {
  return {
    list(projectId: string): Webhook[] {
      return db.all<Row>(`SELECT id, url, events_json, created_at, last_at, last_status, last_error FROM webhooks WHERE project_id = ? AND project_id IN ${OWNS} ORDER BY created_at`, projectId, userId).map(fromRow);
    },
    count(projectId: string): number {
      return db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM webhooks WHERE project_id = ? AND project_id IN ${OWNS}`, projectId, userId)?.n ?? 0;
    },
    create(w: { id: string; project_id: string; url: string; secret: string; events: string[]; at: string }): boolean {
      return (
        db.run(`INSERT INTO webhooks (id, project_id, url, secret, events_json, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE ? IN ${OWNS}`, w.id, w.project_id, w.url, w.secret, JSON.stringify(w.events), w.at, w.project_id, userId).changes === 1
      );
    },
    remove(projectId: string, id: string): boolean {
      return db.run(`DELETE FROM webhooks WHERE id = ? AND project_id = ? AND project_id IN ${OWNS}`, id, projectId, userId).changes === 1;
    },
  };
}
export type WebhooksRepository = ReturnType<typeof createWebhooksRepository>;

/** For delivery, which runs off the request path: the hooks of one project that want this event, with secrets. */
export function hooksFor(db: Database, projectId: string, event: string): { id: string; url: string; secret: string }[] {
  return db
    .all<{ id: string; url: string; secret: string; events_json: string }>('SELECT id, url, secret, events_json FROM webhooks WHERE project_id = ?', projectId)
    .filter((h) => (JSON.parse(h.events_json) as string[]).includes(event));
}

export function hookById(db: Database, projectId: string, id: string): { id: string; url: string; secret: string } | undefined {
  return db.get('SELECT id, url, secret FROM webhooks WHERE id = ? AND project_id = ?', id, projectId);
}

export function recordDelivery(db: Database, id: string, at: string, status: number | null, error: string | null): void {
  db.run('UPDATE webhooks SET last_at = ?, last_status = ?, last_error = ? WHERE id = ?', at, status, error?.slice(0, 300) ?? null, id);
}
