import { InfoIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/errors';
import type { Advice } from '@/api/types';
import { hrefOf, navigate } from '@/app/router';
import { Pip } from '@/components/brand/pip';
import { Page, PageHeader } from '@/components/shared/page';
import { QueryView } from '@/components/shared/query-view';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppConfig } from '@/features/projects/api';
import { BackTo } from '@/features/projects/project-page';
import { formatRelative } from '@/lib/format';
import { isWorking, useAdvice, useDeleteAdvice } from './api';
import { MarketSection, EvidenceSection } from './components/market-section';
import { PlanSection } from './components/plan-section';
import { PricingSection } from './components/pricing-section';
import { VerdictSection } from './components/verdict-section';
import { CrewLineup, STAGE } from './crew';

function Report({ advice, projectId }: { advice: Advice; projectId: string }) {
  const info = useAppConfig().data?.advisor;
  const x = advice.result;
  if (!x) return null;
  return (
    <div className="flex flex-col gap-10">
      {x.mode === 'offline' && (
        <Alert>
          <InfoIcon />
          <AlertTitle>Research only</AlertTitle>
          <AlertDescription>
            <p>This server has no model key, so the crew searched the web but could not ask buyers, set prices or write a plan. Add a free Groq or Gemini key and ask again for the full report.</p>
          </AlertDescription>
        </Alert>
      )}
      {x.plan && <VerdictSection plan={x.plan} reception={x.reception} info={info} buyers={x.buyers.length} />}
      {x.pricing && <PricingSection pricing={x.pricing} info={info} />}
      {x.plan && <PlanSection plan={x.plan} findings={x.findings} projectId={projectId} />}
      <MarketSection result={x} info={info} />
      <EvidenceSection result={x} info={info} currency={advice.input.currency} />
      <p className="text-xs text-muted-foreground">
        Buyers and their answers are simulated by {x.model ?? 'no model'} in {x.model_calls} calls. Quotes are copied word for word from the pages linked. Treat this as a rehearsal of your launch, not a forecast of sales.
      </p>
    </div>
  );
}

function Working({ advice }: { advice: Advice }) {
  const info = useAppConfig().data?.advisor;
  return (
    <section aria-live="polite" className="flex flex-col gap-6 rounded-3xl border bg-band p-6 md:p-8">
      <div className="space-y-2">
        <h2 className="text-xl">{STAGE[advice.status]}</h2>
        <Progress value={advice.progress} aria-label="Progress" />
        <p className="text-sm text-body">This takes a minute or two. You can leave this page; the report keeps going and waits for you here.</p>
      </div>
      <CrewLineup info={info} status={advice.status} />
    </section>
  );
}

export function AdvicePage({ id, aid }: { id: string; aid: string }) {
  const advice = useAdvice(id, aid);
  const remove = useDeleteAdvice(id);
  const back = <BackTo href={hrefOf({ name: 'project', id, tab: 'advisor' })}>Launch advisor</BackTo>;
  return (
    <Page>
      <QueryView query={advice} loading={<Skeleton className="h-96 rounded-3xl" />}>
        {(a) => (
          <>
            <PageHeader
              back={back}
              title={`Launch advice for ${a.title}`}
              description={`Asked ${formatRelative(a.created_at)}.`}
              actions={
                !isWorking(a) && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      remove.mutate(aid, {
                        onSuccess: () => {
                          toast.success('Advice deleted');
                          navigate({ name: 'project', id, tab: 'advisor' }, { replace: true });
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
            {isWorking(a) && <Working advice={a} />}
            {a.status === 'failed' && (
              <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed bg-card px-6 py-12 text-center">
                <Pip variant="oops" className="size-24" />
                <h2 className="text-xl">The crew could not finish</h2>
                <p className="max-w-[52ch] text-sm text-body">{a.error}</p>
                <Button asChild>
                  <a href={hrefOf({ name: 'project', id, tab: 'advisor' })}>Ask again</a>
                </Button>
              </div>
            )}
            {a.status === 'done' && <Report advice={a} projectId={id} />}
          </>
        )}
      </QueryView>
    </Page>
  );
}
