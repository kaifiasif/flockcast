import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/errors';
import type { Invite, Member, Project } from '@/api/types';
import { CopyButton } from '@/components/shared/copy-button';
import { QueryView } from '@/components/shared/query-view';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { formatDate, formatRelative } from '@/lib/format';
import { useCreateInvite, useMembers, useRemoveMember, useRevokeInvite, useSetRole } from './api';

type MemberRole = 'editor' | 'reviewer' | 'viewer';
export const ROLE: Record<string, { name: string; can: string }> = {
  owner: { name: 'Owner', can: 'Everything, including people, keys and billing.' },
  editor: { name: 'Editor', can: 'Rehearses, compares drafts, asks for approval.' },
  reviewer: { name: 'Reviewer', can: 'Reads everything and approves or sends back drafts.' },
  viewer: { name: 'Viewer', can: 'Reads rehearsals and results.' },
};

function RolePicker({ value, onChange, id, disabled }: { value: MemberRole; onChange: (r: MemberRole) => void; id: string; disabled?: boolean }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as MemberRole)} disabled={disabled}>
      <SelectTrigger id={id} className="h-9 w-36" aria-label="Role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(['editor', 'reviewer', 'viewer'] as const).map((r) => (
          <SelectItem key={r} value={r}>
            {ROLE[r].name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MemberRow({ m, project, me }: { m: Member; project: Project; me: boolean }) {
  const setRole = useSetRole(project.id);
  const remove = useRemoveMember(project.id);
  const owner = project.role === 'owner';
  return (
    <li className="flex flex-wrap items-center gap-x-5 gap-y-2 px-6 py-4">
      <div className="min-w-0 flex-1 basis-56">
        <p className="truncate font-medium text-foreground">
          {m.email}
          {me && <span className="text-muted-foreground"> (you)</span>}
        </p>
        <p className="text-sm text-muted-foreground">{m.added_at ? `Joined ${formatDate(m.added_at)}` : 'Made this project'}</p>
      </div>
      {owner && m.role !== 'owner' ? (
        <RolePicker id={`role-${m.user_id}`} value={m.role as MemberRole} disabled={setRole.isPending} onChange={(role) => setRole.mutate({ uid: m.user_id, role }, { onError: (e) => toast.error(errorMessage(e)) })} />
      ) : (
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-body">{ROLE[m.role]?.name}</span>
      )}
      {m.role !== 'owner' && (owner || me) && (
        <Button
          variant="ghost"
          size="sm"
          disabled={remove.isPending}
          onClick={() =>
            remove.mutate(m.user_id, {
              onSuccess: () => toast.success(me ? 'You left the project' : `Removed ${m.email}`),
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        >
          {me ? 'Leave' : 'Remove'}
        </Button>
      )}
    </li>
  );
}

function InviteRow({ i, projectId }: { i: Invite; projectId: string }) {
  const revoke = useRevokeInvite(projectId);
  const state = i.used_at ? `Used by ${i.used_by_email ?? 'someone'} ${formatRelative(i.used_at)}` : i.revoked_at ? 'Withdrawn' : new Date(i.expires_at) < new Date() ? 'Expired' : `Open until ${formatDate(i.expires_at)}`;
  const open = !i.used_at && !i.revoked_at && new Date(i.expires_at) > new Date();
  return (
    <li className="flex flex-wrap items-center gap-x-5 gap-y-1 px-6 py-3 text-sm">
      <span className="font-medium text-foreground">{ROLE[i.role].name} link</span>
      <span className="flex-1 text-muted-foreground">{state}</span>
      {open && (
        <Button variant="ghost" size="sm" disabled={revoke.isPending} onClick={() => revoke.mutate(i.id, { onError: (e) => toast.error(errorMessage(e)) })}>
          Withdraw
        </Button>
      )}
    </li>
  );
}

function InviteMaker({ project }: { project: Project }) {
  const create = useCreateInvite(project.id);
  const [role, setRole] = useState<MemberRole>('editor');
  const link = create.data ? `${location.origin}${location.pathname}${create.data.path}` : null;
  return (
    <div className="rounded-3xl border bg-band p-6">
      <h2 className="text-lg">Invite someone</h2>
      <p className="mt-1 text-sm text-body">Make a link and send it however you like. It works once, for 7 days. Whoever opens it signs in or makes an account and joins with this role.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <RolePicker id="invite-role" value={role} onChange={setRole} />
        <Button onClick={() => create.mutate(role, { onError: (e) => toast.error(errorMessage(e)) })} disabled={create.isPending}>
          {create.isPending && <Spinner />}
          Make invite link
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{ROLE[role].can}</p>
      {link && (
        <div className="mt-4 grid gap-2">
          <p className="text-sm font-medium text-foreground">Copy it now; it is not shown again.</p>
          <div className="rounded-2xl border bg-card p-3 font-mono text-[12px] break-all text-foreground">{link}</div>
          <div>
            <CopyButton text={link} label="Copy link" />
          </div>
        </div>
      )}
    </div>
  );
}

export function TeamPanel({ project, userId }: { project: Project; userId: string }) {
  const members = useMembers(project.id);
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <QueryView query={members} loading={<Skeleton className="h-48 rounded-3xl" />}>
        {(data) => (
          <div className="grid gap-4">
            <section aria-label="Members">
              <ul className="divide-y overflow-hidden rounded-3xl border bg-card">
                {data.members.map((m) => (
                  <MemberRow key={m.user_id} m={m} project={project} me={m.user_id === userId} />
                ))}
              </ul>
            </section>
            {data.invites.length > 0 && (
              <section aria-label="Invite links">
                <h2 className="mb-2 text-sm font-medium text-foreground">Invite links</h2>
                <ul className="divide-y overflow-hidden rounded-3xl border bg-card">
                  {data.invites.map((i) => (
                    <InviteRow key={i.id} i={i} projectId={project.id} />
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </QueryView>
      {project.role === 'owner' ? (
        <InviteMaker project={project} />
      ) : (
        <div className="rounded-3xl border bg-band p-6 text-sm text-body">
          <p className="font-medium text-foreground">You are {ROLE[project.role].name.toLowerCase()} here.</p>
          <p className="mt-1">{ROLE[project.role].can}</p>
        </div>
      )}
    </div>
  );
}
