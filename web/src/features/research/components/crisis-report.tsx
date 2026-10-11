import { CheckIcon, TriangleAlertIcon } from 'lucide-react';
import type { StudyResult } from '@/api/types';
import { CopyButton } from '@/components/shared/copy-button';
import { cn } from '@/lib/utils';
import { ResearchByline } from '../crew';

type Result = Extract<StudyResult, { kind: 'crisis' }>;
const RISK = { low: 'Low risk', medium: 'Some risk', high: 'High risk' } as const;

function Heat({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-1" role="img" aria-label={`Heat ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={cn('size-2.5 rounded-full', n <= value ? 'bg-brand' : 'bg-band')} />
      ))}
    </span>
  );
}

export function CrisisReport({ x }: { x: Result }) {
  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-5 rounded-3xl border bg-card p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <ResearchByline agent="juniper">How the statement lands, group by group</ResearchByline>
          <span className={cn('rounded-full px-3 py-1 text-sm font-medium', x.risk.level === 'high' ? 'bg-brand-soft text-brand' : x.risk.level === 'medium' ? 'bg-band text-foreground' : 'bg-support-soft text-support')}>
            {RISK[x.risk.level]}
          </span>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {x.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-sm">
              {c.level === 'good' ? <CheckIcon className="mt-0.5 size-4 shrink-0 text-support" aria-hidden /> : <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />}
              <span>
                <span className="font-medium text-foreground">{c.title}.</span> <span className="text-body">{c.detail}</span>
                {c.level === 'risk' && c.excerpt && <span className="mt-1 block text-xs text-muted-foreground">“{c.excerpt}”</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="reactions" className="grid gap-4">
        <h2 id="reactions" className="text-xl">
          Reactions
        </h2>
        <ul className="grid gap-4 md:grid-cols-2">
          {x.reactions.map((r) => (
            <li key={r.group} className="rounded-3xl border bg-card p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg">{r.name}</h3>
                <Heat value={r.heat} />
              </div>
              <p className="mt-2 text-sm text-body">{r.reaction}</p>
              {r.worst_line && (
                <p className="mt-3 text-sm">
                  <span className="text-muted-foreground">Would quote back: </span>
                  <span className="text-foreground">“{r.worst_line}”</span>
                </p>
              )}
              {r.question && <p className="mt-2 text-sm text-foreground">Asks next: {r.question}</p>}
            </li>
          ))}
        </ul>
      </section>

      {x.spread && (
        <section className="grid gap-4 rounded-3xl border bg-band p-6 md:p-8">
          <h2 className="text-xl">The next day</h2>
          <p className="text-sm text-body">
            Spread: {x.spread.spread}. {x.spread.why}
          </p>
          {x.spread.headlines.length > 0 && (
            <ul className="grid gap-2">
              {x.spread.headlines.map((h) => (
                <li key={h} className="font-display text-lg font-bold text-foreground">
                  {h}
                </li>
              ))}
            </ul>
          )}
          {x.spread.follow_ups.length > 0 && (
            <div>
              <p className="text-sm font-medium text-foreground">Questions to have answers for</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-body">
                {x.spread.follow_ups.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="grid gap-4 rounded-3xl border bg-card p-6 md:p-8">
        <h2 className="text-xl">What to change</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-body">
          {x.advice.changes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        {x.advice.revised && (
          <div className="grid gap-3 rounded-2xl bg-band p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-foreground">A steadier version</p>
              <CopyButton text={x.advice.revised} label="Copy statement" />
            </div>
            <p className="whitespace-pre-line text-foreground">{x.advice.revised}</p>
            <p className="text-xs text-muted-foreground">Fill in every [fact] yourself. It replaces anything the draft would otherwise have made up.</p>
          </div>
        )}
      </section>
    </div>
  );
}
