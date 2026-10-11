import { TriangleAlertIcon } from 'lucide-react';
import type { StudyResult } from '@/api/types';
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ResearchByline } from '../crew';

type Result = Extract<StudyResult, { kind: 'message_test' }>;
const LETTERS = 'ABCD';

export function MessageTestReport({ x }: { x: Result }) {
  const who = (id: number) => x.panel.find((p) => p.id === id);
  const name = (i: number | null) => (i === null ? 'none' : `Version ${LETTERS[i]}`);
  const best = x.winner !== null ? x.overall[x.winner] : null;
  const disagree = x.matrix.filter((row) => row.winner !== null && row.winner !== x.winner);
  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-5 rounded-3xl border bg-card p-6 md:p-8">
        <ResearchByline agent="tally">
          {x.panel.length} people in {x.matrix.length} {x.matrix.length === 1 ? 'group' : 'groups'} rated {x.messages.length} versions
        </ResearchByline>
        {best && (
          <p className="font-display text-2xl font-bold text-foreground">
            {name(x.winner)} came out ahead, scoring {best.score} out of 100.
          </p>
        )}
        {x.split && (
          <div className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-brand-soft px-4 py-3 text-sm text-foreground">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            <p>Groups disagree. {disagree.map((r) => `${r.segment} preferred ${name(r.winner)}`).join('; ')}. One message for everyone may lose some of them.</p>
          </div>
        )}
        <div className="-mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[28rem] border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Score out of 100 and share who would act, per group and version</caption>
            <thead>
              <tr>
                <th scope="col" className="py-2 pr-3 text-left font-medium text-muted-foreground">
                  Group
                </th>
                {x.messages.map((m, i) => (
                  <th key={i} scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Version {LETTERS[i]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {x.matrix.map((row) => (
                <tr key={row.segment}>
                  <th scope="row" className="border-t py-3 pr-3 text-left font-medium text-foreground">
                    {row.segment}
                  </th>
                  {row.cells.map((c) => (
                    <td key={c.message} className={cn('border-t px-3 py-3 tabular-nums', c.message === row.winner && 'bg-support-soft')}>
                      <span className="font-display text-lg font-bold text-foreground">{c.score ?? 'n/a'}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{formatPercent(c.act_share)} would act</span>
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row" className="border-t py-3 pr-3 text-left font-medium text-foreground">
                  Every group equally
                </th>
                {x.overall.map((o) => (
                  <td key={o.message} className={cn('border-t px-3 py-3 tabular-nums', o.message === x.winner && 'bg-support-soft')}>
                    <span className="font-display text-lg font-bold text-foreground">{o.score ?? 'n/a'}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{formatPercent(o.act_share)} would act</span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">Scores combine appeal, clarity and believability. Each group counts the same, however many people it had.</p>
      </section>

      <section aria-labelledby="versions" className="grid gap-4">
        <h2 id="versions" className="text-xl">
          The versions and what people said
        </h2>
        <ul className="grid gap-4 md:grid-cols-2">
          {x.messages.map((m, i) => {
            const said = x.matrix.map((row) => ({ segment: row.segment, quote: row.cells[i].quote })).filter((q) => q.quote);
            return (
              <li key={i} className={cn('rounded-3xl border bg-card p-6', i === x.winner && 'border-support')}>
                <p className="label-mono">Version {LETTERS[i]}</p>
                <p className="mt-2 whitespace-pre-line text-foreground">{m.text}</p>
                {said.map((q) => (
                  <blockquote key={q.segment} className="mt-3 border-l-2 border-primary/40 pl-3 text-sm text-foreground">
                    “{q.quote!.text}”<footer className="mt-1 text-xs text-muted-foreground">{who(q.quote!.person)?.name}, {q.segment}</footer>
                  </blockquote>
                ))}
                {m.brand && m.brand.length > 0 && (
                  <ul className="mt-4 grid gap-1.5 text-sm">
                    {m.brand.map((b) => (
                      <li key={b.rule} className={b.level === 'risk' ? 'text-brand' : 'text-body'}>
                        Ivy: {b.detail}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
