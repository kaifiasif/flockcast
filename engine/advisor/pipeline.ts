/**
 * One advisor run, start to finish. With a model: plan searches, search, read the market, ask the
 * buyers, price, decide (four model calls). Without one: the searches still run on the founder's
 * own words and the report shows what was found, labelled as research only.
 */
import { counting, type Llm } from '../llm.ts';
import { askBuyers, receptionOf } from './buyers.ts';
import { decide, pricingOf } from './planner.ts';
import { priceRange, pricePoints } from './pricing.ts';
import { offlineQueries, planQueries, readMarket, searchAll } from './research.ts';
import type { AdviceInput, AdviceResult, AdviceStatus, SearchAdapter } from './types.ts';

export interface PipelineDeps {
  llm: Llm | null;
  search: SearchAdapter[];
  onStep?: (status: AdviceStatus, progress: number) => void;
}

export async function runAdvice(input: AdviceInput, deps: PipelineDeps): Promise<AdviceResult> {
  const step = deps.onStep ?? (() => {});
  const llm = deps.llm ? counting(deps.llm) : null;

  step('researching', 0.05);
  const queries = llm ? await planQueries(llm, input) : offlineQueries(input);
  const { findings, searched } = await searchAll(deps.search, queries);
  step('researching', 0.3);

  const base: AdviceResult = { mode: llm ? 'full' : 'offline', model: llm?.model ?? null, model_calls: 0, queries, searched, findings, market: null, buyers: [], reception: null, pricing: null, plan: null };
  if (!llm) return base;

  const market = await readMarket(llm, input, findings);
  step('simulating', 0.45);
  const buyers = await askBuyers(llm, input, market);
  const reception = receptionOf(buyers);
  const range = priceRange(buyers.map((b) => b.prices));
  step('deciding', 0.75);
  const decision = await decide(llm, input, { market, reception, range, points: range ? pricePoints(range, input.billing, input.currency) : null, findings });
  return {
    ...base,
    model_calls: llm.calls,
    market,
    buyers,
    reception,
    pricing: range ? pricingOf(input, range, decision) : null,
    plan: decision.plan,
  };
}
