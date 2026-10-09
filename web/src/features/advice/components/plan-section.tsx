import { CopyIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { AdviceResult } from '@/api/types';
import { navigate } from '@/app/router';
import { Button } from '@/components/ui/button';
import { handOffDraft } from '@/lib/draft-handoff';
import { EFFORT } from '../labels';
import { Cite } from './cite';

type Plan = NonNullable<AdviceResult['plan']>;
type Finding = AdviceResult['findings'][number];

/** What to build, what to do this week, and the post to launch with. */
export function PlanSection({ plan, findings, projectId }: { plan: Plan; findings: Finding[]; projectId: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plan.launch_post);
      toast.success('Launch post copied');
    } catch {
      toast.error('Copying was blocked. Select the text and copy it instead.');
    }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="features" className="rounded-3xl border bg-card p-6 md:p-8">
        <h2 id="features" className="text-xl">
          Build these first
        </h2>
        <ul className="mt-4 space-y-4">
          {plan.features.map((f) => (
            <li key={f.name}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base">{f.name}</h3>
                <span className="rounded-full bg-band px-2 py-0.5 text-xs text-body">{EFFORT[f.effort]}</span>
              </div>
              <p className="mt-1 text-sm text-body">
                {f.why} <Cite id={f.finding} findings={findings} />
              </p>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="steps" className="rounded-3xl border bg-card p-6 md:p-8">
        <h2 id="steps" className="text-xl">
          Your launch steps
        </h2>
        <ol className="mt-4 list-decimal space-y-2.5 pl-5 text-[15px] text-body marker:font-semibold marker:text-foreground">
          {plan.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        {plan.risks.length > 0 && (
          <>
            <h3 className="mt-6 text-base">Watch out for</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-body">
              {plan.risks.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </>
        )}
      </section>
      {plan.launch_post && (
        <section aria-labelledby="launch-post" className="rounded-3xl border bg-band p-6 md:p-8 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="launch-post" className="text-xl">
              Your launch post
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void copy()}>
                <CopyIcon /> Copy post
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  handOffDraft(plan.launch_post);
                  navigate({ name: 'compose', id: projectId });
                }}
              >
                Rehearse this post
              </Button>
            </div>
          </div>
          <p className="mt-4 max-w-[70ch] rounded-2xl border bg-card p-5 text-[16px] leading-relaxed whitespace-pre-line text-foreground">{plan.launch_post}</p>
        </section>
      )}
    </div>
  );
}
