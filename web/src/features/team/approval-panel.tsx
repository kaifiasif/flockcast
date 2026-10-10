import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage, isApiError } from '@/api/errors';
import type { Project, Rehearsal } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useSession } from '@/features/auth/api';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useApproval, useDecideApproval, useRequestApproval } from './api';

const STATUS = {
  pending: { label: 'Waiting for review', tone: 'bg-muted text-body' },
  approved: { label: 'Approved', tone: 'bg-support-soft text-support' },
  changes_requested: { label: 'Changes asked for', tone: 'bg-brand-soft text-brand' },
  withdrawn: { label: 'Withdrawn', tone: 'bg-muted text-muted-foreground' },
} as const;

/** Sign-off before posting: an editor asks with the rehearsal attached, a reviewer or the owner decides. */
export function ApprovalPanel({ r, project }: { r: Rehearsal; project: Project }) {
  const me = useSession().data?.user?.id;
  const approval = useApproval(project.id, r.id);
  const request = useRequestApproval(project.id, r.id);
  const decide = useDecideApproval(project.id, r.id);
  const [note, setNote] = useState('');
  const [comment, setComment] = useState('');
  const a = approval.data;
  const canAsk = project.role === 'owner' || project.role === 'editor';
  const canDecide = (project.role === 'owner' || project.role === 'reviewer') && a?.status === 'pending' && a.requested_by !== me;
  // hidden on plans without approvals rather than showing a dead button
  if (approval.isError && isApiError(approval.error, 'PLAN_REQUIRED')) return null;
  if (!a && !canAsk) return null;

  return (
    <section className="rounded-3xl border bg-card p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl">Sign-off</h2>
        {a && <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS[a.status].tone)}>{STATUS[a.status].label}</span>}
      </div>
      {a && (
        <div className="mt-3 space-y-1 text-sm text-body">
          <p>
            {a.requested_by_email ?? 'Someone'} asked {formatRelative(a.requested_at)}
            {a.note && <>: “{a.note}”</>}
          </p>
          {a.decided_at && (
            <p>
              {a.decided_by_email ?? 'A reviewer'} decided {formatRelative(a.decided_at)}
              {a.comment && <>: “{a.comment}”</>}
            </p>
          )}
        </div>
      )}
      {canDecide && (
        <div className="mt-5 grid gap-3">
          <Field>
            <FieldLabel htmlFor="approval-comment">Comment</FieldLabel>
            <Textarea id="approval-comment" rows={2} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional, and shown to whoever asked" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button disabled={decide.isPending} onClick={() => decide.mutate({ aid: a.id, decision: 'approved', comment }, { onSuccess: () => toast.success('Approved'), onError: (e) => toast.error(errorMessage(e)) })}>
              {decide.isPending && <Spinner />}
              Approve
            </Button>
            <Button variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ aid: a.id, decision: 'changes_requested', comment }, { onSuccess: () => toast.success('Sent back with changes'), onError: (e) => toast.error(errorMessage(e)) })}>
              Ask for changes
            </Button>
          </div>
        </div>
      )}
      {canAsk && a?.status !== 'pending' && (
        <form
          className="mt-5 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            request.mutate(note, { onSuccess: () => (setNote(''), toast.success('Asked for approval')), onError: (err) => toast.error(errorMessage(err)) });
          }}
        >
          {!a && <p className="text-sm text-body">Ask a reviewer to sign off before this goes out. They see the draft and everything the crowd said.</p>}
          <Field>
            <FieldLabel htmlFor="approval-note">Note for the reviewer</FieldLabel>
            <Textarea id="approval-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional, like when it goes out" />
          </Field>
          <Button type="submit" className="w-fit" disabled={request.isPending}>
            {request.isPending && <Spinner />}
            {a ? 'Ask again' : 'Ask for approval'}
          </Button>
        </form>
      )}
    </section>
  );
}
