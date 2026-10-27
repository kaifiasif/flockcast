import { MoreHorizontalIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/errors';
import type { Rehearsal, RehearsalResult } from '@/api/types';
import { hrefOf, navigate } from '@/app/router';
import { Pip } from '@/components/brand/pip';
import { pipFor } from '@/components/brand/pip-for';
import { Markdown } from '@/components/shared/markdown';
import { Page, PageHeader } from '@/components/shared/page';
import { QueryView } from '@/components/shared/query-view';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useAppConfig, useProject } from '@/features/projects/api';
import { ApprovalPanel } from '@/features/team/approval-panel';
import { BackTo } from '@/features/projects/project-page';
import { formatDate, formatPercent, plural as count, verbPlural } from '@/lib/format';
import { cn } from '@/lib/utils';
import { isActive, useDeleteRehearsal, useRehearsal, useStartRehearsal } from './api';
import { OutcomePanel } from '@/features/compare/outcome-panel';
import { AskFollower } from './ask-follower';
import { AiCheck, CrowdWarning, Fixes, PlatformChecks, ReplyPrep } from './studio-notes';
import { BrandNotes } from '@/features/research/brand-notes';
import { engineLabel, STAGE } from './labels';

function Running({ r }: { r: Rehearsal }) {
  return (
    <div className="flex flex-col items-center gap-5 rounded-3xl border bg-card px-6 py-16 text-center">
      <Pip variant={r.status === 'reporting' ? 'analyst' : r.status === 'running' ? 'listener' : 'sleepy'} className="size-28" />
      <div className="space-y-1">
        <h2 className="text-2xl">{STAGE[r.status]}</h2>
        <p className="text-sm text-body">
          {r.settings.mode === 'quick' ? `A quick read by ${r.settings.personas} followers.` : `${r.settings.personas} followers, ${r.settings.rounds} rounds.`} This page updates on its own; you can leave and come back.
        </p>
      </div>
      <Progress value={Math.max(4, r.progress)} className="h-2 w-full max-w-sm" aria-label="Rehearsal progress" />
    </div>
  );
}

function Failed({ r, onRetry, retrying }: { r: Rehearsal; onRetry: () => void; retrying: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border bg-card px-6 py-14 text-center">
      <Pip variant="oops" className="size-28" />
      <div className="space-y-1">
        <h2 className="text-2xl">This rehearsal did not finish</h2>
        <p className="mx-auto max-w-[60ch] text-sm text-body">{r.error ?? 'Something went wrong while the crowd was reading.'}</p>
      </div>
      <Button onClick={onRetry} disabled={retrying}>
        {retrying && <Spinner />}
        Try again
      </Button>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'brand' | 'support' }) {
  return (
    <div className="rounded-3xl border bg-card px-5 py-4">
      <p className="label-mono">{label}</p>
      <p className={cn('mt-1 font-display text-3xl font-bold tracking-tight text-foreground tabular-nums', tone === 'brand' && 'text-brand', tone === 'support' && 'text-support')}>{value}</p>
    </div>
  );
}

function Sentences({ x }: { x: RehearsalResult }) {
  const [open, setOpen] = useState<number | null>(null);
  const most = Math.max(1, ...x.sentences.map((s) => s.pushback));
  return (
    <section className="rounded-3xl border bg-card p-6 md:p-8">
      <h2 className="text-xl">Your post, sentence by sentence</h2>
      <p className="mt-1 text-sm text-body">The thicker the coral line, the more replies argued with that sentence. Pick one to see what was said.</p>
      <ol className="mt-5 space-y-1">
        {x.sentences.map((s, i) => {
          const share = s.pushback / most;
          const selected = open === i;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => setOpen(selected ? null : i)}
                aria-expanded={selected}
                className={cn('w-full rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-background', selected && 'bg-background')}
              >
                <span className={cn('text-[16px] leading-relaxed text-foreground', s.pushback > 0 && 'pushback')} style={{ '--share': share } as React.CSSProperties}>
                  {s.text}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {s.mentions ? `${count(s.mentions, 'reply', 'replies')} about this, ${s.pushback} pushing back` : 'Nobody replied about this'}
                </span>
              </button>
              {selected && s.examples.length > 0 && (
                <ul className="mx-3 mt-1 mb-3 space-y-2 border-l-2 border-primary/40 pl-4 text-sm text-body">
                  {s.examples.map((e, j) => (
                    <li key={j}>“{e}”</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Replies({ x }: { x: RehearsalResult }) {
  const byId = new Map(x.personas.map((p) => [p.id, p]));
  if (!x.replies.length) return <p className="rounded-3xl border bg-card p-6 text-sm text-body">Nobody replied. The crowd read it and moved on, which is a result too.</p>;
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {x.replies.map((r, i) => {
        const p = byId.get(r.agent_id);
        const critic = r.agent_id === x.critic;
        return (
          <li key={i} className="flex gap-3 rounded-3xl border bg-card p-4">
            <Pip variant={critic ? 'contrarian' : pipFor({ id: r.agent_id, stance: p?.stance })} className="-mt-1 -ml-1 size-12" />
            <div className="min-w-0 text-sm">
              <p className="leading-tight">
                <span className="font-semibold text-foreground">{r.agent_name}</span> {p && <span className="text-muted-foreground">{p.segment}</span>}
              </p>
              <p className="mt-1 text-[15px] text-body">{r.text}</p>
              <p className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {critic && <span className="rounded-full bg-foreground px-2 py-px font-medium text-background">harsh critic</span>}
                {r.stance === 'pushback' && <span className="rounded-full bg-brand-soft px-2 py-px font-medium text-brand">pushback</span>}
                <span className="rounded-full bg-muted px-2 py-px text-muted-foreground">{r.kind === 'quote' ? 'quote' : 'reply'}</span>
                {r.round !== null && <span className="rounded-full bg-muted px-2 py-px text-muted-foreground">round {r.round}</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Results({ r, projectId }: { r: Rehearsal; projectId: string }) {
  const x = r.result!;
  const config = useAppConfig();
  const project = useProject(projectId).data;
  const platform = config.data?.platforms.find((p) => p.id === x.platform);
  const verbs = platform?.verbs ?? { like: 'like', repost: 'repost', reply: 'reply', quote: 'quote' };

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label={verbPlural(verbs.reply)} value={x.counts.replies} />
        <Stat label="Quotes" value={x.counts.quotes} />
        <Stat label={verbPlural(verbs.repost)} value={x.counts.reposts} />
        <Stat label={verbPlural(verbs.like)} value={x.counts.likes} />
        <Stat label="Pushback" value={formatPercent(x.pushback_share)} tone={x.pushback_share >= 0.34 ? 'brand' : 'support'} />
      </div>

      <CrowdWarning x={x} />
      <Fixes x={x} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Sentences x={x} />
        <section className="rounded-3xl border bg-band p-6 md:p-8">
          <h2 className="text-xl">Report</h2>
          <div className="mt-4">
            {x.report ? <Markdown text={x.report.markdown} /> : <p className="text-sm text-body">{x.report_error ?? 'No report was written for this rehearsal.'}</p>}
          </div>
        </section>
      </div>

      {(x.ai_check || x.checks || x.brand) && (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <BrandNotes x={x} />
          <AiCheck x={x} />
          <PlatformChecks x={x} platformName={platform?.id === 'generic' ? 'Platform' : (platform?.name ?? 'Platform')} />
        </div>
      )}

      <section className="space-y-4">
        <h2 className="text-2xl">What the crowd said</h2>
        <Replies x={x} />
      </section>

      <ReplyPrep x={x} />

      <AskFollower rehearsal={r} projectId={projectId} />

      {project && <ApprovalPanel r={r} project={project} />}

      {project && (project.role === 'owner' || project.role === 'editor') && <OutcomePanel r={r} projectId={projectId} />}

      <p className="text-xs text-muted-foreground">
        {engineLabel(x)}
        {x.engine !== 'swarm-offline' && `, ${count(x.model_calls, 'model call')}`}. {x.mode === 'quick' ? `A quick read by ${x.agents} followers` : `${x.agents} followers over ${x.rounds ?? '?'} rounds`}, {x.total_actions} actions.{' '}
        {x.draft_seeded ? 'Your draft was posted to the crowd word for word.' : `Your draft was matched at ${formatPercent(x.draft_match)}.`}
      </p>
    </div>
  );
}

export function RehearsalPage({ id, rid }: { id: string; rid: string }) {
  const rehearsal = useRehearsal(id, rid);
  const role = useProject(id).data?.role;
  const canEdit = role === 'owner' || role === 'editor';
  const start = useStartRehearsal(id);
  const remove = useDeleteRehearsal(id);
  const back = hrefOf({ name: 'project', id, tab: 'rehearsals' });

  // the same text and settings again; force skips the saved result
  const rerun = (r: Rehearsal) =>
    start.mutate(
      { text: r.posts.join('\n---\n'), title: r.title, platform: r.settings.platform as never, personas: r.settings.personas, rounds: r.settings.rounds, audience: r.settings.audience ?? undefined, critic: r.settings.critic, mode: r.settings.mode, force: true },
      { onSuccess: (next) => navigate({ name: 'rehearsal', id, rid: next.id }), onError: (e) => toast.error(errorMessage(e)) },
    );

  return (
    <Page>
      <QueryView query={rehearsal} loading={<Skeleton className="h-96 rounded-3xl" />}>
        {(r) => (
          <>
            <PageHeader
              back={r.group_id ? <BackTo href={hrefOf({ name: 'comparison', id, gid: r.group_id })}>Comparison</BackTo> : <BackTo href={back}>Rehearsals</BackTo>}
              title={r.variant ? `Draft ${r.variant}: ${r.title}` : r.title}
              description={`${formatDate(r.created_at)}. ${r.settings.personas} followers, ${r.settings.mode === 'quick' ? 'quick read' : `${r.settings.rounds} rounds`}${r.result ? `, ${engineLabel(r.result)}` : ''}.`}
              actions={
                !isActive(r) && canEdit && (
                  <>
                  {r.status === 'done' && (
                    <Button variant="outline" asChild>
                      <a href={hrefOf({ name: 'compose', id, from: rid })}>Edit and run again</a>
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" aria-label="More actions">
                        <MoreHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => rerun(r)}>Run again with a new crowd</DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a href={hrefOf({ name: 'compose', id })}>Rehearse another post</a>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onSelect={() =>
                          remove.mutate(rid, {
                            onSuccess: () => {
                              toast.success('Rehearsal deleted');
                              navigate({ name: 'project', id, tab: 'rehearsals' }, { replace: true });
                            },
                            onError: (e) => toast.error(errorMessage(e)),
                          })
                        }
                      >
                        Delete rehearsal
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  </>
                )
              }
            />
            {isActive(r) && <Running r={r} />}
            {r.status === 'failed' && <Failed r={r} retrying={start.isPending} onRetry={() => rerun(r)} />}
            {r.status === 'done' && r.result && <Results r={r} projectId={id} />}
          </>
        )}
      </QueryView>
    </Page>
  );
}
