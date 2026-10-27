import { InfoIcon } from 'lucide-react';
import { useState } from 'react';
import type { Project, StudySummary } from '@/api/types';
import { hrefOf } from '@/app/router';
import { QueryView } from '@/components/shared/query-view';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAppConfig } from '@/features/projects/api';
import { useUsage } from '@/features/team/api';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { isWorking, useStudies } from './api';
import { CrisisForm } from './components/crisis-form';
import { FocusGroupForm } from './components/focus-group-form';
import { MessageTestForm } from './components/message-test-form';
import { KIND_LABEL, KINDS, ResearchSticker, STAGE, type StudyKind } from './crew';

function History({ project }: { project: Project }) {
  const list = useStudies(project.id);
  return (
    <QueryView query={list} loading={<Skeleton className="h-32 rounded-3xl" />}>
      {(items: StudySummary[]) =>
        items.length > 0 && (
          <section aria-labelledby="study-history">
            <h2 id="study-history" className="mb-3 text-xl">
              Earlier studies
            </h2>
            <ul className="divide-y overflow-hidden rounded-3xl border bg-card">
              {items.map((s) => (
                <li key={s.id}>
                  <a href={hrefOf({ name: 'study', id: project.id, sid: s.id })} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 transition-colors hover:bg-background focus-visible:bg-background focus-visible:outline-none">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{s.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {KIND_LABEL[s.kind]}, {formatRelative(s.created_at)}
                      </p>
                    </div>
                    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', s.status === 'failed' ? 'bg-brand-soft text-brand' : isWorking(s) ? 'shimmer text-foreground' : 'bg-band text-body')}>{STAGE[s.status]}</span>
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

/** The project's Research tab: pick a kind of study, fill it in, read earlier ones. */
export function ResearchPanel({ project }: { project: Project }) {
  const info = useAppConfig().data?.research;
  const usage = useUsage(project.id);
  const [kind, setKind] = useState<StudyKind>('focus_group');
  const allowed = usage.data?.plan.features.includes('research');
  const canStart = project.role === 'owner' || project.role === 'editor';
  const current = KINDS.find((k) => k.kind === kind)!;
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="research-title" className="rounded-3xl border bg-band p-6 md:p-8">
        <div className="mb-6 max-w-[62ch] space-y-1.5">
          <h2 id="research-title" className="text-2xl">
            Research before you go public
          </h2>
          <p className="text-[15px] text-body">Ask a panel, test versions of a message on several groups at once, or rehearse a statement before a hard day. Every person is simulated, so treat it as a rehearsal, not survey data.</p>
        </div>
        <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {(['maple', 'tally', 'juniper', 'ivy'] as const).map((a, i) => (
            <li key={a} className="flex flex-col items-center gap-2 rounded-3xl border bg-card p-4 text-center">
              <ResearchSticker agent={a} className="size-20" tilt={i % 2 ? 5 : -5} />
              <p className="font-display text-[15px] font-bold leading-tight text-foreground">{info?.agents[a].name}</p>
              <p className="text-xs text-body">{info?.agents[a].job}</p>
            </li>
          ))}
        </ul>
      </section>

      {usage.data && !allowed ? (
        <div className="rounded-3xl border bg-card p-6 text-sm text-body">
          Focus groups, message tests and crisis rehearsals are on the Enterprise plan. This project is on {usage.data.plan.name}. Brand rules (Ivy) come with Studio and are under Crowd and setup.
        </div>
      ) : canStart ? (
        <section aria-labelledby="new-study" className="rounded-3xl border bg-card p-6 md:p-8">
          <h2 id="new-study" className="text-xl">
            New study
          </h2>
          <ToggleGroup type="single" variant="outline" value={kind} onValueChange={(v) => v && setKind(v as StudyKind)} aria-label="Kind of study" className="mt-4 w-full flex-wrap sm:w-fit">
            {KINDS.map((k) => (
              <ToggleGroupItem key={k.kind} value={k.kind} className="flex-1 px-4 sm:flex-none">
                {k.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="mt-3 mb-6 text-sm text-body">{current.blurb}</p>
          {kind === 'focus_group' && <FocusGroupForm projectId={project.id} />}
          {kind === 'message_test' && <MessageTestForm projectId={project.id} maxPanel={info?.limits.maxPanel ?? 50} />}
          {kind === 'crisis' && <CrisisForm projectId={project.id} />}
        </section>
      ) : null}

      {info?.mode === 'offline' && (
        <Alert>
          <InfoIcon />
          <AlertTitle>Offline estimates on this server</AlertTitle>
          <AlertDescription>
            <p>There is no model key, so panels answer from simple rules about your text: unbacked claims, long sentences, a missing next step. Add a free Groq or Gemini key for real discussion.</p>
          </AlertDescription>
        </Alert>
      )}
      <History project={project} />
    </div>
  );
}
