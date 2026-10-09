import type { AdviceResult, AdvisorInfo } from '@/api/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { plural } from '@/lib/format';
import { AgentByline } from '../crew';
import { money } from '../labels';
import { Cite } from './cite';

type Result = AdviceResult;
const KIND: Record<string, string> = { pain: 'Pain', praise: 'Praise', doubt: 'Doubt', request: 'Wish' };

/** Professor Quill's reading: competitors and the exact words people used, each linked to its page. */
export function MarketSection({ result, info }: { result: Result; info: AdvisorInfo | undefined }) {
  const { market, findings } = result;
  return (
    <section aria-labelledby="market" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 id="market" className="text-2xl">
            What people are saying
          </h2>
          {market && <p className="max-w-[70ch] text-[15px] text-body">{market.summary}</p>}
        </div>
        <AgentByline agent="professor" info={info}>
          Read {plural(findings.length, 'page')}
        </AgentByline>
      </div>
      {market && market.voices.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {market.voices.map((v) => (
            <li key={`${v.finding}-${v.quote}`} className="flex flex-col gap-3 rounded-3xl border bg-card p-5">
              <span className="w-fit rounded-full bg-band px-2 py-0.5 text-xs font-medium text-body">{KIND[v.kind] ?? v.kind}</span>
              <blockquote className="text-[15px] leading-relaxed text-foreground">“{v.quote}”</blockquote>
              <Cite id={v.finding} findings={findings} />
            </li>
          ))}
        </ul>
      )}
      {market && market.competitors.length > 0 && (
        <div className="overflow-x-auto rounded-3xl border bg-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Competitors</caption>
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="px-5 py-3 font-medium">Competitor</th>
                <th className="px-5 py-3 font-medium">Price</th>
                <th className="px-5 py-3 font-medium">Good at</th>
                <th className="px-5 py-3 font-medium">Weak at</th>
              </tr>
            </thead>
            <tbody className="divide-y text-body">
              {market.competitors.map((c) => (
                <tr key={c.name} className="align-top">
                  <td className="px-5 py-3">
                    <p className="font-medium text-foreground">{c.name}</p>
                    <p className="text-xs">{c.what}</p>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">{c.price ?? 'Not found'}</td>
                  <td className="px-5 py-3">{c.strength}</td>
                  <td className="px-5 py-3">
                    {c.weakness} <Cite id={c.finding} findings={findings} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {market && market.price_signals.length > 0 && (
        <div className="rounded-3xl border bg-band p-5">
          <h3 className="text-base">What people say they pay</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-body">
            {market.price_signals.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Bramble's searches and every page found, plus the buyers, folded away for anyone who wants to check. */
export function EvidenceSection({ result, info, currency }: { result: Result; info: AdvisorInfo | undefined; currency: string }) {
  return (
    <section aria-labelledby="evidence" className="flex flex-col gap-4 rounded-3xl border bg-card p-6 md:p-8">
      <AgentByline agent="scout" info={info}>
        Searched {result.searched.map((s) => `${s.source} (${s.ok ? plural(s.found, 'result') : 'unreachable'})`).join(', ') || 'nowhere'}
      </AgentByline>
      <h2 id="evidence" className="sr-only">
        Sources and buyers
      </h2>
      <Collapsible>
        <CollapsibleTrigger className="rounded-full text-sm font-medium text-brand underline-offset-4 hover:underline">Show every page found ({result.findings.length})</CollapsibleTrigger>
        <CollapsibleContent>
          <p className="mt-3 text-xs text-muted-foreground">Searched for: {result.queries.join('; ')}</p>
          <ul className="mt-3 divide-y text-sm">
            {result.findings.map((f) => (
              <li key={f.id} className="py-3">
                <a href={/^https?:\/\//.test(f.url) ? f.url : undefined} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-foreground underline-offset-4 hover:underline">
                  {f.title || f.text.slice(0, 80)}
                </a>
                <span className="text-muted-foreground">, {f.source}</span>
                <p className="mt-1 line-clamp-3 text-body">{f.text}</p>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
      {result.buyers.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="rounded-full text-sm font-medium text-brand underline-offset-4 hover:underline">Meet the {result.buyers.length} simulated buyers</CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-3 grid gap-3 md:grid-cols-2">
              {result.buyers.map((b) => (
                <li key={b.id} className="rounded-2xl border bg-background p-4 text-sm">
                  <p className="font-medium text-foreground">
                    {b.name} <span className="font-normal text-muted-foreground">, {b.segment}</span>
                  </p>
                  <p className="mt-1 text-body">{b.bio}</p>
                  <p className="mt-2 text-body">
                    Interest {b.interest}/5, {b.would_try ? 'would try it' : 'would not try it'}. A bargain at {money(b.prices.bargain, currency)}, too expensive at {money(b.prices.too_expensive, currency)}.
                  </p>
                  {b.objection && <p className="mt-1 text-muted-foreground">“{b.objection}”</p>}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </section>
  );
}
