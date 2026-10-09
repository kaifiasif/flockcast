import { InfoIcon } from 'lucide-react';
import type { Advice, Project } from '@/api/types';
import { hrefOf } from '@/app/router';
import { QueryView } from '@/components/shared/query-view';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppConfig } from '@/features/projects/api';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { isWorking, useAdviceList } from './api';
import { AdviceForm } from './components/advice-form';
import { AgentSticker, CrewLineup, STAGE } from './crew';

function History({ project }: { project: Project }) {
  const list = useAdviceList(project.id);
  return (
    <QueryView query={list} loading={<Skeleton className="h-32 rounded-3xl" />}>
      {(items: Advice[]) =>
        items.length > 0 && (
          <section aria-labelledby="advice-history">
            <h2 id="advice-history" className="mb-3 text-xl">
              Earlier advice
            </h2>
            <ul className="divide-y overflow-hidden rounded-3xl border bg-card">
              {items.map((a) => (
                <li key={a.id}>
                  <a href={hrefOf({ name: 'advice', id: project.id, aid: a.id })} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 transition-colors hover:bg-background focus-visible:bg-background focus-visible:outline-none">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{a.title}</p>
                      <p className="text-sm text-muted-foreground">{formatRelative(a.created_at)}</p>
                    </div>
                    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', a.status === 'failed' ? 'bg-brand-soft text-brand' : isWorking(a) ? 'shimmer text-foreground' : 'bg-band text-body')}>{STAGE[a.status]}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )
      }
    </QueryView>
  );
}

/** The project's Launch advisor tab: meet the crew, describe the product, read earlier advice. */
export function AdvisorPanel({ project }: { project: Project }) {
  const config = useAppConfig();
  const info = config.data?.advisor;
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="crew-title" className="rounded-3xl border bg-band p-6 md:p-8">
        <div className="mb-6 max-w-[62ch] space-y-1.5">
            <h2 id="crew-title" className="text-2xl">
              Your launch crew
            </h2>
            <p className="text-[15px] text-body">Five agents read what people say about products like yours, ask a crowd of simulated buyers what they would pay, and hand you a plan. You don't need to know pricing or marketing: do what the report says.</p>
        </div>
        <CrewLineup info={info} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <AdviceForm project={project} />
        <aside className="flex h-fit flex-col gap-4">
          <div className="rounded-3xl border bg-card p-6">
            <AgentSticker agent="captain" className="-mt-2 -ml-2 size-20" tilt={-4} />
            <h2 className="mt-2 text-lg">What you get back</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-body">
              <li>A clear call: launch, launch after changes, or rethink.</li>
              <li>How much the buyers liked it and what put them off.</li>
              <li>Your prices and plans, with the reason for each number.</li>
              <li>The features to add first, your launch steps and a launch post.</li>
              <li>Your competitors, and real quotes from people, with links.</li>
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">Buyers are simulated. Treat the report as a rehearsal, not a forecast.</p>
          </div>
          {info?.mode === 'offline' && (
            <Alert>
              <InfoIcon />
              <AlertTitle>Research only on this server</AlertTitle>
              <AlertDescription>
                <p>There is no model key, so the crew can search but not ask buyers or decide prices. Add a free Groq or Gemini key for the full report.</p>
              </AlertDescription>
            </Alert>
          )}
        </aside>
      </div>
      <History project={project} />
    </div>
  );
}
