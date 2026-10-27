import type { Rehearsal } from '@/api/types';
import { hrefOf } from '@/app/router';
import { Pip } from '@/components/brand/pip';
import { Page, PageHeader } from '@/components/shared/page';
import { QueryView } from '@/components/shared/query-view';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { BackTo } from '@/features/projects/project-page';
import { isActive } from '@/features/rehearsals/api';
import { STAGE } from '@/features/rehearsals/labels';
import { formatDate, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useComparison } from './api';

/** Engagement per follower, weighting shares over likes. Mirrors engine/calibration.ts. */
const score = (r: Rehearsal) => {
  const x = r.result;
  return x ? (x.counts.likes + 2 * x.counts.reposts + 2 * x.counts.quotes + x.counts.replies) / Math.max(1, x.agents) : -1;
};

function pickOf(list: Rehearsal[]): Rehearsal | null {
  const done = list.filter((r) => r.status === 'done' && r.result);
  if (done.length < 2 || done.length < list.length) return null;
  return done.reduce((a, b) => (score(b) > score(a) || (score(b) === score(a) && b.result!.pushback_share < a.result!.pushback_share) ? b : a));
}

function Line({ label, value, strong }: { label: string; value: string | number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <dt className="text-body">{label}</dt>
      <dd className={cn('tabular-nums text-foreground', strong && 'font-semibold')}>{value}</dd>
    </div>
  );
}

function Column({ r, projectId, picked }: { r: Rehearsal; projectId: string; picked: boolean }) {
  const x = r.result;
  const worst = x?.sentences.reduce<(typeof x.sentences)[number] | null>((a, s) => (s.pushback > (a?.pushback ?? 0) ? s : a), null);
  return (
    <article className={cn('flex flex-col gap-4 rounded-3xl border bg-card p-5 md:p-6', picked && 'border-primary ring-2 ring-primary/25')}>
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-xl">Draft {r.variant}</h2>
        {picked && <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">Crowd’s pick</span>}
      </header>
      <p className="line-clamp-6 whitespace-pre-line text-[15px] leading-relaxed text-foreground">{r.posts.join('\n\n')}</p>
      {isActive(r) && (
        <div className="space-y-2">
          <p className="text-sm text-body">{r.status === 'queued' && r.variant !== 'A' ? 'Waiting for the crowd from draft A' : STAGE[r.status]}</p>
          <Progress value={Math.max(4, r.progress)} className="h-2" aria-label={`Draft ${r.variant} progress`} />
        </div>
      )}
      {r.status === 'failed' && <p className="text-sm text-brand">{r.error}</p>}
      {x && (
        <>
          <dl className="divide-y border-y">
            <Line label="Engagement per follower" value={score(r).toFixed(2)} strong={picked} />
            <Line label="Replies and quotes" value={x.counts.replies + x.counts.quotes} />
            <Line label="Reposts" value={x.counts.reposts} />
            <Line label="Likes" value={x.counts.likes} />
            <Line label="Pushback" value={formatPercent(x.pushback_share)} />
            {x.ai_check && <Line label="Reads as AI" value={`${x.ai_check.score}%`} />}
          </dl>
          {worst && (
            <div className="text-sm">
              <p className="label-mono">Most pushback</p>
              <p className="mt-1 text-foreground">“{worst.text}”</p>
            </div>
          )}
          <Button variant="outline" asChild className="mt-auto w-fit">
            <a href={hrefOf({ name: 'rehearsal', id: projectId, rid: r.id })}>See draft {r.variant} in full</a>
          </Button>
        </>
      )}
    </article>
  );
}

export function ComparisonPage({ id, gid }: { id: string; gid: string }) {
  const comparison = useComparison(id, gid);
  return (
    <Page>
      <QueryView query={comparison} loading={<Skeleton className="h-96 rounded-3xl" />}>
        {(list) => {
          const pick = pickOf(list);
          const first = list[0];
          return (
            <>
              <PageHeader
                back={<BackTo href={hrefOf({ name: 'project', id, tab: 'rehearsals' })}>Rehearsals</BackTo>}
                title={`Comparing ${list.length} drafts`}
                description={`${formatDate(first.created_at)}. The same ${first.settings.personas} simulated followers read each draft over ${first.settings.rounds} rounds.`}
              />
              {pick ? (
                <div className="flex items-center gap-4 rounded-3xl border bg-band p-5">
                  <Pip variant="fan" className="size-16 shrink-0" />
                  <p className="text-[15px] text-foreground">
                    This crowd engaged most with <strong>draft {pick.variant}</strong>. That is a rehearsal, not a forecast: after you post, record the real numbers on the draft you published to see how close it came.
                  </p>
                </div>
              ) : (
                list.some(isActive) && <p className="text-sm text-muted-foreground">Drafts run one after another so each gets the same crowd. This page updates on its own.</p>
              )}
              <div className={cn('grid items-start gap-4', list.length === 3 ? 'lg:grid-cols-3' : 'md:grid-cols-2')}>
                {list.map((r) => (
                  <Column key={r.id} r={r} projectId={id} picked={pick?.id === r.id} />
                ))}
              </div>
            </>
          );
        }}
      </QueryView>
    </Page>
  );
}
