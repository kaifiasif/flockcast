/**
 * Steps four and five: Baron Penny's prices come from arithmetic on the buyers' answers; Captain
 * Compass writes the decision around them. The model names the plans and says what goes in each,
 * but never picks a number, so a confident-sounding price can always be traced back to the buyers.
 */
import type { Llm } from '../llm.ts';
import { pricePoints, type PricePoints } from './pricing.ts';
import type { AdviceInput, Feature, Finding, Market, Plan, PriceRange, Pricing, Reception, Tier, Verdict } from './types.ts';

const str = (v: unknown, max: number, fallback = '') => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : fallback);
const lines = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v : []).slice(0, n).map((s) => str(s, max)).filter(Boolean);
const VERDICTS: Verdict[] = ['go', 'go_with_changes', 'rethink'];
const EFFORTS: Feature['effort'][] = ['small', 'medium', 'large'];

interface TierText {
  name: string;
  who: string;
  includes: string[];
}
export interface Decision {
  plan: Plan;
  free: TierText | null;
  hero: TierText;
  top: TierText;
  why: string;
}

const tierText = (v: unknown, fallback: string): TierText => {
  const t = (v ?? {}) as Record<string, unknown>;
  return { name: str(t.name, 30, fallback), who: str(t.who, 160), includes: lines(t.includes, 6, 120) };
};

export function validateDecision(o: unknown, findings: Finding[]): Decision {
  const d = (o ?? {}) as Record<string, unknown>;
  const ids = new Set(findings.map((f) => f.id));
  const verdict = VERDICTS.includes(d.verdict as Verdict) ? (d.verdict as Verdict) : null;
  const headline = str(d.headline, 200);
  if (!verdict || !headline) throw new Error('expected a verdict (go, go_with_changes or rethink) and a headline');
  const features: Feature[] = (Array.isArray(d.features) ? d.features : []).slice(0, 6).flatMap((raw) => {
    const f = (raw ?? {}) as Record<string, unknown>;
    const name = str(f.name, 80);
    if (!name) return [];
    return [{ name, why: str(f.why, 240), effort: EFFORTS.includes(f.effort as Feature['effort']) ? (f.effort as Feature['effort']) : 'medium', finding: typeof f.finding === 'string' && ids.has(f.finding) ? f.finding : null }];
  });
  const tiers = (d.tiers ?? {}) as Record<string, unknown>;
  return {
    plan: { verdict, headline, reasons: lines(d.reasons, 5, 240), features, steps: lines(d.steps, 8, 240), risks: lines(d.risks, 4, 240), launch_post: str(d.launch_post, 1200) },
    free: d.free_tier === true ? tierText(tiers.free, 'Free') : null,
    hero: tierText(tiers.hero, 'Pro'),
    top: tierText(tiers.top, 'Team'),
    why: str(d.price_why, 500),
  };
}

const money = (n: number, input: AdviceInput) => `${n} ${input.currency}${input.billing === 'subscription' ? ' a month' : ''}`;

export async function decide(
  llm: Llm,
  input: AdviceInput,
  ctx: { market: Market | null; reception: Reception | null; range: PriceRange | null; points: PricePoints | null; findings: Finding[] },
): Promise<Decision> {
  const { market, reception, range, points } = ctx;
  return llm.json({
    system:
      'You are a launch advisor for first-time founders. They will do exactly what you say, so be decisive and concrete: no hedging, no jargon, no "it depends". Base every call on the research and the simulated buyers you are given, and say so when the evidence is thin. Simulated buyers are a rehearsal, not a forecast. Reply with JSON only.',
    user: [
      `Product: ${input.product}\nWhat it does: ${input.pitch}\nFor: ${input.audience ?? 'not stated'}\nThe founder's price idea: ${input.price_idea ?? 'none'}`,
      market ? `Market research: ${market.summary}\nCompetitors: ${market.competitors.map((c) => `${c.name}${c.price ? ` (${c.price})` : ''}: ${c.weakness}`).join('; ') || 'none found'}\nWhat people ask for or complain about: ${market.voices.map((v) => `[${v.finding}] ${v.quote}`).join(' | ') || 'nothing found'}\nPrice signals: ${market.price_signals.join('; ') || 'none'}` : 'No web research is available.',
      reception ? `Simulated buyers: reception ${reception.score}/100, ${Math.round(reception.would_try_share * 100)}% would try it. Top objections: ${reception.objections.join('; ')}. Top must-haves: ${reception.must_haves.join('; ')}.` : '',
      range && points ? `Prices are already decided from the buyers' answers: the main plan is ${money(points.hero, input)}, the bigger plan ${money(points.top, input)}. Acceptable range ${range.low}-${range.high} ${input.currency}. Do not change these numbers; decide only what each plan includes.` : '',
      [
        'Decide:',
        '- verdict: go (launch as is), go_with_changes (launch after the changes you list) or rethink (do not launch yet).',
        '- headline: one sentence the founder reads first.',
        '- reasons: up to 4 short reasons.',
        '- features: up to 5 features to add before or soon after launch, most important first, each with why, effort (small, medium or large) and the finding id that supports it, or null.',
        '- steps: 5 to 8 launch steps in order, each one action the founder can do this week.',
        '- risks: up to 3.',
        '- launch_post: a short, honest launch post (under 120 words) for the place these buyers hang out.',
        '- free_tier: true if a free plan will help people try it, false if not.',
        '- tiers: names (one or two words), who each is for, and up to 5 things each includes, for free (only if free_tier), hero (the main plan) and top (the bigger plan).',
        '- price_why: two sentences on why these prices, in plain words.',
      ].join('\n'),
      'JSON shape: {"verdict":"go_with_changes","headline":"","reasons":[""],"features":[{"name":"","why":"","effort":"small","finding":"f2"}],"steps":[""],"risks":[""],"launch_post":"","free_tier":true,"tiers":{"free":{"name":"","who":"","includes":[""]},"hero":{"name":"","who":"","includes":[""]},"top":{"name":"","who":"","includes":[""]}},"price_why":""}',
    ]
      .filter(Boolean)
      .join('\n\n'),
    validate: (o) => validateDecision(o, ctx.findings),
    temperature: 0.3,
    maxTokens: 6000,
  });
}

export function pricingOf(input: AdviceInput, range: PriceRange, decision: Decision): Pricing {
  const p = pricePoints(range, input.billing, input.currency);
  const sub = input.billing === 'subscription';
  const tier = (t: TierText, price: number, yearly: number | null, hero: boolean): Tier => ({
    name: t.name,
    monthly: sub ? price : null,
    yearly: sub ? yearly : null,
    one_time: sub ? null : price,
    who: t.who,
    includes: t.includes,
    hero,
  });
  const tiers = [
    ...(decision.free ? [tier(decision.free, 0, sub ? 0 : null, false)] : []),
    tier(decision.hero, p.hero, p.heroYearly, true),
    tier(decision.top, p.top, p.topYearly, false),
  ];
  return { currency: input.currency, billing: input.billing, range, tiers, why: decision.why };
}
