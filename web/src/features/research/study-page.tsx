import { InfoIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/errors';
import type { Study } from '@/api/types';
import { hrefOf, navigate } from '@/app/router';
import { Pip } from '@/components/brand/pip';
import { Page, PageHeader } from '@/components/shared/page';
import { QueryView } from '@/components/shared/query-view';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { BackTo } from '@/features/projects/project-page';
import { formatRelative } from '@/lib/format';
import { isWorking, useDeleteStudy, useStudy } from './api';
import { CrisisReport } from './components/crisis-report';
import { FocusGroupReport } from './components/focus-group-report';
import { MessageTestReport } from './components/message-test-report';
import { KIND_LABEL, KINDS, ResearchSticker, STAGE } from './crew';

function Report({ study }: { study: Study }) {
  const x = study.result;
  if (!x) return null;
  return (
    <div className="flex flex-col gap-8">
      {x.engine === 'swarm-offline' && (
        <Alert>
          <InfoIcon />
          <AlertTitle>Offline estimate</AlertTitle>
          <AlertDescription>
            <p>This server has no model key, so people answered from simple rules about your text. Add a free Groq or Gemini key and run it again for a real discussion.</p>
          </AlertDescription>
        </Alert>
      )}
      {x.kind === 'focus_group' && <FocusGroupReport x={x} />}
      {x.kind === 'message_test' && <MessageTestReport x={x} />}
      {x.kind === 'crisis' && <CrisisReport x={x} />}
      <p className="text-xs text-muted-foreground">
        Everyone here is simulated{x.model ? ` by ${x.model} in ${x.model_calls} calls` : ''}. Treat it as a rehearsal of the conversation, not a survey or a forecast.
      </p>
    </div>
  );
}

export function StudyPage({ id, sid }: { id: string; sid: string }) {
  const study = useStudy(id, sid);
  const remove = useDeleteStudy(id);
  const back = <BackTo href={hrefOf({ name: 'project', id, tab: 'research' })}>Research</BackTo>;
  return (
    <Page>
      <QueryView query={study} loading={<Skeleton className="h-96 rounded-3xl" />}>
        {(s) => (
          <>
            <PageHeader
              back={back}
              title={s.title}
              description={`${KIND_LABEL[s.kind]}, started ${formatRelative(s.created_at)}.`}
              actions={
                !isWorking(s) && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      remove.mutate(sid, {
                        onSuccess: () => {
                          toast.success('Study deleted');
                          navigate({ name: 'project', id, tab: 'research' }, { replace: true });
                        },
                        onError: (e) => toast.error(errorMessage(e)),
                      })
                    }
                  >
                    <Trash2Icon /> Delete
                  </Button>
                )
              }
            />
            {isWorking(s) && (
              <section aria-live="polite" className="flex flex-col items-center gap-4 rounded-3xl border bg-band p-8 text-center">
                <ResearchSticker agent={KINDS.find((k) => k.kind === s.kind)!.agent} className="crew-bob size-24" />
                <h2 className="text-xl">{STAGE[s.status]}</h2>
                <Progress value={s.progress} aria-label="Progress" className="max-w-md" />
                <p className="text-sm text-body">This takes a minute or two. You can leave; the study keeps going.</p>
              </section>
            )}
            {s.status === 'failed' && (
              <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed bg-card px-6 py-12 text-center">
                <Pip variant="oops" className="size-24" />
                <h2 className="text-xl">The study could not finish</h2>
                <p className="max-w-[52ch] text-sm text-body">{s.error}</p>
                <Button asChild>
                  <a href={hrefOf({ name: 'project', id, tab: 'research' })}>Try again</a>
                </Button>
              </div>
            )}
            {s.status === 'done' && <Report study={s} />}
          </>
        )}
      </QueryView>
    </Page>
  );
}
