import type { AdviceResult, AdvisorInfo } from '@/api/types';
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AgentByline, AgentSticker } from '../crew';
import { VERDICT } from '../labels';

type Plan = NonNullable<AdviceResult['plan']>;
type Reception = NonNullable<AdviceResult['reception']>;

/** Captain Compass's call, first thing on the page, with the buyers' reception beside it. */
export function VerdictSection({ plan, reception, info, buyers }: { plan: Plan; reception: Reception | null; info: AdvisorInfo | undefined; buyers: number }) {
  const v = VERDICT[plan.verdict];
  return (
    <section aria-labelledby="verdict" className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="relative overflow-hidden rounded-3xl border bg-card p-6 md:p-8">
        <AgentSticker agent="captain" className="absolute -top-2 -right-2 size-28 opacity-95 max-sm:size-20" tilt={8} />
        <p className="text-sm font-medium text-muted-foreground">{info?.agents.captain.name} says</p>
        <span className={cn('mt-3 inline-block rounded-full px-3 py-1 text-sm font-semibold', v.tone)}>{v.label}</span>
        <h2 id="verdict" className="mt-4 max-w-[34ch] pr-16 text-2xl leading-snug md:text-[28px]">
          {plan.headline}
        </h2>
        {plan.reasons.length > 0 && (
          <ul className="mt-5 list-disc space-y-1.5 pl-5 text-[15px] text-body">
            {plan.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </div>
      {reception && (
        <div className="flex flex-col gap-5 rounded-3xl border bg-band p-6 md:p-8">
          <AgentByline agent="murmur" info={info}>
            Asked {buyers} simulated buyers
          </AgentByline>
          <div className="flex items-end gap-6">
            <div>
              <p className="font-display text-5xl font-bold tracking-tight text-foreground tabular-nums">{reception.score}</p>
              <p className="text-sm text-body">liking, out of 100</p>
            </div>
            <div>
              <p className="font-display text-5xl font-bold tracking-tight text-foreground tabular-nums">{formatPercent(reception.would_try_share)}</p>
              <p className="text-sm text-body">would try it</p>
            </div>
          </div>
          <Reasons title="What put them off" items={reception.objections} />
          <Reasons title="What it must do" items={reception.must_haves} />
        </div>
      )}
    </section>
  );
}

function Reasons({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <ul className="mt-1.5 space-y-1 text-sm text-body">
        {items.slice(0, 3).map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}
