import { HeartIcon, MessageCircleIcon, Repeat2Icon } from 'lucide-react';
import type { Project, Rehearsal } from '@/api/types';
import { hrefOf } from '@/app/router';
import { EmptyState } from '@/components/shared/empty-state';
import { QueryView } from '@/components/shared/query-view';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPercent, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CalibrationCard } from '@/features/compare/calibration-card';
import { isActive, useRehearsals } from './api';
import { engineLabel, STAGE } from './labels';

function Row({ projectId, r }: { projectId: string; r: Rehearsal }) {
  const x = r.result;
  return (
    <li>
      <a href={hrefOf({ name: 'rehearsal', id: projectId, rid: r.id })} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-5 transition-colors hover:bg-background focus-visible:bg-background focus-visible:outline-none">
        <div className="min-w-0 flex-1 basis-64">
          <p className="truncate font-medium text-foreground">
            {r.variant && <span className="mr-2 rounded-full bg-muted px-2 py-px text-xs font-medium text-body">Draft {r.variant}</span>}
            {r.title}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatRelative(r.created_at)}
            {x && `, ${engineLabel(x)}`}
            {r.outcome && ', real results recorded'}
          </p>
        </div>
        {x ? (
          <div className="flex items-center gap-5 text-sm text-body tabular-nums">
            <span className="inline-flex items-center gap-1.5" title="Replies and quotes">
              <MessageCircleIcon className="size-4 text-muted-foreground" /> {x.counts.replies + x.counts.quotes}
            </span>
            <span className="inline-flex items-center gap-1.5" title="Reposts">
              <Repeat2Icon className="size-4 text-muted-foreground" /> {x.counts.reposts}
            </span>
            <span className="inline-flex items-center gap-1.5" title="Likes">
              <HeartIcon className="size-4 text-muted-foreground" /> {x.counts.likes}
            </span>
            <span className={cn('w-28 rounded-full px-2.5 py-0.5 text-center text-xs font-medium', x.pushback_share >= 0.34 ? 'bg-brand-soft text-brand' : 'bg-support-soft text-support')}>
              {formatPercent(x.pushback_share)} pushback
            </span>
          </div>
        ) : (
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', r.status === 'failed' ? 'bg-brand-soft text-brand' : 'shimmer text-foreground')}>{STAGE[r.status]}</span>
        )}
      </a>
    </li>
  );
}

export function RehearsalList({ project }: { project: Project }) {
  const list = useRehearsals(project.id);
  return (
    <QueryView query={list} loading={<Skeleton className="h-48 rounded-3xl" />}>
      {(rehearsals) =>
        rehearsals.length ? (
          <section aria-label="Rehearsals">
            <CalibrationCard projectId={project.id} />
            <ul className="divide-y overflow-hidden rounded-3xl border bg-card">
              {rehearsals.map((r) => (
                <Row key={r.id} projectId={project.id} r={r} />
              ))}
            </ul>
            {rehearsals.some(isActive) && <p className="mt-3 text-sm text-muted-foreground">Running rehearsals update here on their own.</p>}
          </section>
        ) : (
          <EmptyState
            pip="listener"
            title="The crowd is listening"
            description="Paste a draft to see how this crowd reacts: who replies, who reposts, and which sentence draws the pushback."
            action={
              <Button asChild>
                <a href={hrefOf({ name: 'compose', id: project.id })}>Rehearse a post</a>
              </Button>
            }
          />
        )
      }
    </QueryView>
  );
}
