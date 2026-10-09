import { CheckIcon } from 'lucide-react';
import type { AdviceResult, AdvisorInfo } from '@/api/types';
import { cn } from '@/lib/utils';
import { AgentByline } from '../crew';
import { money } from '../labels';

type Pricing = NonNullable<AdviceResult['pricing']>;

/** Where the hero price sits inside the range the buyers accept. */
function RangeBar({ pricing }: { pricing: Pricing }) {
  const { low, high } = pricing.range;
  const hero = pricing.tiers.find((t) => t.hero);
  const price = hero?.monthly ?? hero?.one_time ?? null;
  const span = Math.max(high - low, 0.01);
  const at = price === null ? null : Math.min(100, Math.max(0, ((price - low) / span) * 100));
  return (
    <div className="rounded-2xl border bg-card p-5">
      <p className="text-sm text-body">
        Buyers accept a price between <strong className="text-foreground">{money(low, pricing.currency)}</strong> and <strong className="text-foreground">{money(high, pricing.currency)}</strong>
        {pricing.billing === 'subscription' ? ' a month' : ''}. Below that it looks cheap; above it, too expensive.
      </p>
      <div className="relative mt-5 mb-7 h-2.5 rounded-full bg-gradient-to-r from-[#f5b3ad] via-[#9fc0a5] to-[#f5b3ad]" role="img" aria-label={`Acceptable price range ${money(low, pricing.currency)} to ${money(high, pricing.currency)}`}>
        {at !== null && (
          <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${at}%` }}>
            <span className="block size-5 rounded-full border-4 border-card bg-foreground shadow" />
            <span className="absolute top-6 left-1/2 -translate-x-1/2 text-xs font-semibold whitespace-nowrap text-foreground">{money(price, pricing.currency)}</span>
          </span>
        )}
      </div>
    </div>
  );
}

export function PricingSection({ pricing, info }: { pricing: Pricing; info: AdvisorInfo | undefined }) {
  const sub = pricing.billing === 'subscription';
  return (
    <section aria-labelledby="pricing" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 id="pricing" className="text-2xl">
            Your prices
          </h2>
          {pricing.why && <p className="max-w-[62ch] text-[15px] text-body">{pricing.why}</p>}
        </div>
        <AgentByline agent="baron" info={info}>
          Priced from the buyers' answers
        </AgentByline>
      </div>
      <RangeBar pricing={pricing} />
      <ul className={cn('grid gap-4', pricing.tiers.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
        {pricing.tiers.map((t) => {
          const price = sub ? t.monthly : t.one_time;
          return (
            <li key={t.name} className={cn('flex flex-col gap-4 rounded-3xl border bg-card p-6', t.hero && 'border-primary shadow-[0_0_0_1px_var(--primary)]')}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg">{t.name}</h3>
                {t.hero && <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand">Most people pick this</span>}
              </div>
              <div>
                <p className="font-display text-4xl font-bold tracking-tight text-foreground">
                  {money(price, pricing.currency)}
                  {sub && price ? <span className="text-base font-medium text-muted-foreground"> a month</span> : null}
                </p>
                {sub && t.yearly ? (
                  <p className="text-sm text-body">
                    or {money(t.yearly, pricing.currency)} a year, about 20% off
                  </p>
                ) : null}
              </div>
              {t.who && <p className="text-sm text-body">For {t.who.charAt(0).toLowerCase() + t.who.slice(1)}</p>}
              <ul className="space-y-1.5 text-sm text-body">
                {t.includes.map((x) => (
                  <li key={x} className="flex gap-2">
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-support" /> {x}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
