import { DownloadIcon } from 'lucide-react';
import type { Project } from '@/api/types';
import { QueryView } from '@/components/shared/query-view';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { useAudit, useUsage } from './api';

const ACTIONS: Record<string, string> = {
  'project.created': 'made the project',
  'project.updated': 'changed the project setup',
  'project.exported': 'exported the rehearsals',
  'rehearsal.started': 'started a rehearsal',
  'rehearsal.deleted': 'deleted a rehearsal',
  'comparison.started': 'compared drafts',
  'outcome.recorded': 'recorded real results',
  'outcome.removed': 'removed real results',
  'advice.started': 'asked the launch advisor',
  'api_key.created': 'made an API key',
  'api_key.revoked': 'revoked an API key',
  'invite.created': 'made an invite link',
  'invite.revoked': 'withdrew an invite link',
  'member.joined': 'joined',
  'member.left': 'left',
  'member.removed': 'removed a member',
  'member.role_changed': 'changed a role',
  'approval.requested': 'asked for approval',
  'approval.approved': 'approved a draft',
  'approval.changes_requested': 'asked for changes',
  'approval.withdrawn': 'withdrew an approval request',
  'webhook.created': 'added a webhook',
  'webhook.deleted': 'deleted a webhook',
  'study.started': 'started a study',
  'study.deleted': 'deleted a study',
  'brand.updated': 'changed the brand rules',
  'brand.cleared': 'cleared the brand rules',
};

const apiBase = (id: string) => `/api/projects/${id}`;

/** Plan and usage, exports, and the audit log: what an admin or a compliance team asks for. */
export function AuditPanel({ project }: { project: Project }) {
  const usage = useUsage(project.id);
  const has = (f: string) => usage.data?.plan.features.includes(f as never) ?? false;
  const audit = useAudit(project.id, has('audit'));
  const u = usage.data;
  return (
    <div className="grid gap-6">
      {u && (
        <section className="grid gap-4 rounded-3xl border bg-card p-6 sm:grid-cols-3" aria-label="Plan and usage">
          <div>
            <p className="label-mono">Plan</p>
            <p className="mt-1 font-display text-2xl font-bold text-foreground">{u.plan.name}</p>
            {!u.plans_enabled && <p className="text-xs text-muted-foreground">Self-hosted: every feature is on.</p>}
          </div>
          <div>
            <p className="label-mono">Rehearsals this month</p>
            <p className="mt-1 font-display text-2xl font-bold text-foreground tabular-nums">
              {u.month.rehearsals}
              {u.plan.limits.rehearsalsPerMonth !== null && <span className="text-base text-muted-foreground"> of {u.plan.limits.rehearsalsPerMonth}</span>}
            </p>
          </div>
          <div>
            <p className="label-mono">People</p>
            <p className="mt-1 font-display text-2xl font-bold text-foreground tabular-nums">{u.members}</p>
          </div>
        </section>
      )}
      {has('export') && (
        <section className="flex flex-wrap items-center gap-3 rounded-3xl border bg-band p-6" aria-label="Export">
          <div className="min-w-0 flex-1 basis-64">
            <h2 className="text-lg">Export rehearsals</h2>
            <p className="text-sm text-body">The latest 200, with results and any real numbers you entered.</p>
          </div>
          <Button variant="outline" asChild>
            <a href={`${apiBase(project.id)}/export?format=csv`} download>
              <DownloadIcon /> CSV
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href={`${apiBase(project.id)}/export?format=json`} download>
              <DownloadIcon /> JSON
            </a>
          </Button>
        </section>
      )}
      <section className="grid gap-3" aria-label="Audit log">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl">Audit log</h2>
          {has('audit') && (
            <Button variant="outline" size="sm" asChild>
              <a href={`${apiBase(project.id)}/audit/csv`} download>
                <DownloadIcon /> Download CSV
              </a>
            </Button>
          )}
        </div>
        {!has('audit') ? (
          <p className="rounded-3xl border bg-card p-6 text-sm text-body">The audit log is on the Enterprise plan: who started, approved, exported or changed what, and when.</p>
        ) : (
          <QueryView query={audit} loading={<Skeleton className="h-48 rounded-3xl" />}>
            {(events) =>
              events.length ? (
                <ol className="divide-y overflow-hidden rounded-3xl border bg-card">
                  {events.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-6 py-3 text-sm">
                      <span className="w-40 shrink-0 text-muted-foreground tabular-nums">{formatDate(e.at)}</span>
                      <span className="min-w-0 flex-1 text-foreground">
                        <span className="font-medium">{e.actor}</span> {ACTIONS[e.action] ?? e.action}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="rounded-3xl border bg-card p-6 text-sm text-body">Nothing yet.</p>
              )
            }
          </QueryView>
        )}
      </section>
    </div>
  );
}
