import type { StudyResult } from '@/api/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatPercent } from '@/lib/format';
import { ResearchByline } from '../crew';

type Result = Extract<StudyResult, { kind: 'focus_group' }>;
type Share = { positive: number; mixed: number; negative: number };

/** Positive, mixed and negative as one bar, with the numbers in words for screen readers. */
function MoodBar({ share, label }: { share: Share; label: string }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">
          {formatPercent(share.positive)} warm, {formatPercent(share.negative)} cool
        </span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-band" aria-hidden>
        <span className="bg-support" style={{ width: `${share.positive * 100}%` }} />
        <span className="bg-border" style={{ width: `${share.mixed * 100}%` }} />
        <span className="bg-brand" style={{ width: `${share.negative * 100}%` }} />
      </div>
    </div>
  );
}

export function FocusGroupReport({ x }: { x: Result }) {
  const who = (id: number) => x.panel.find((p) => p.id === id);
  const quotes = (ids: number[]) =>
    x.transcript
      .flatMap((t) => t.answers)
      .filter((a) => ids.includes(a.person))
      .slice(0, 2);
  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-6 rounded-3xl border bg-card p-6 md:p-8">
        <ResearchByline agent="maple">
          {x.panel.length} people, {x.transcript.length} {x.transcript.length === 1 ? 'question' : 'questions'}
        </ResearchByline>
        <div className="grid gap-4">
          <MoodBar share={x.sentiment.overall} label="Everyone" />
          {x.sentiment.by_segment.map((g) => (
            <MoodBar key={g.segment} share={g} label={g.segment} />
          ))}
        </div>
        {(x.summary.agreement || x.summary.disagreement) && (
          <dl className="grid gap-4 sm:grid-cols-2">
            {x.summary.agreement && (
              <div className="rounded-2xl bg-band p-4">
                <dt className="label-mono">Agreed</dt>
                <dd className="mt-1 text-sm text-foreground">{x.summary.agreement}</dd>
              </div>
            )}
            {x.summary.disagreement && (
              <div className="rounded-2xl bg-band p-4">
                <dt className="label-mono">Split</dt>
                <dd className="mt-1 text-sm text-foreground">{x.summary.disagreement}</dd>
              </div>
            )}
          </dl>
        )}
      </section>

      <section aria-labelledby="themes" className="grid gap-4">
        <h2 id="themes" className="text-xl">
          What came up
        </h2>
        <ul className="grid gap-4 md:grid-cols-2">
          {x.summary.themes.map((t) => (
            <li key={t.title} className="rounded-3xl border bg-card p-6">
              <h3 className="text-lg">{t.title}</h3>
              <p className="mt-1 text-sm text-body">{t.detail}</p>
              {quotes(t.people).map((a, i) => (
                <blockquote key={i} className="mt-3 border-l-2 border-primary/40 pl-3 text-sm text-foreground">
                  “{a.text}”<footer className="mt-1 text-xs text-muted-foreground">{who(a.person)?.name}, {who(a.person)?.segment}</footer>
                </blockquote>
              ))}
            </li>
          ))}
        </ul>
      </section>

      {(x.summary.by_segment.length > 0 || x.summary.recommendations.length > 0) && (
        <section className="grid gap-6 md:grid-cols-2">
          {x.summary.by_segment.length > 0 && (
            <div className="rounded-3xl border bg-card p-6">
              <h2 className="text-lg">Each group's takeaway</h2>
              <ul className="mt-3 grid gap-3 text-sm">
                {x.summary.by_segment.map((g) => (
                  <li key={g.segment}>
                    <span className="font-medium text-foreground">{g.segment}:</span> <span className="text-body">{g.takeaway}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {x.summary.recommendations.length > 0 && (
            <div className="rounded-3xl border bg-card p-6">
              <h2 className="text-lg">What to change</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-body">
                {x.summary.recommendations.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <Collapsible className="rounded-3xl border bg-card p-6">
        <CollapsibleTrigger className="rounded-full text-sm font-medium text-brand underline-offset-4 hover:underline">Read the whole session</CollapsibleTrigger>
        <CollapsibleContent className="mt-5 grid gap-6">
          {x.transcript.map((t, i) => (
            <div key={i}>
              <p className="font-medium text-foreground">{t.question}</p>
              <ul className="mt-2 grid gap-2">
                {t.answers.map((a) => (
                  <li key={a.person} className="text-sm">
                    <span className="font-medium text-foreground">{who(a.person)?.name}</span> <span className="text-muted-foreground">({who(a.person)?.segment})</span>: <span className="text-body">{a.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
