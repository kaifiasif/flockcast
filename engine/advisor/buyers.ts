/**
 * Step three: a simulated set of potential buyers hears the pitch and answers the four price
 * questions. Simulated answers are a rehearsal of the conversation, not market data, and the
 * report says so.
 */
import type { Llm } from '../llm.ts';
import type { AdviceInput, Buyer, Market, Reception } from './types.ts';

const str = (v: unknown, max: number, fallback = '') => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : fallback);
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);

export function validateBuyers(o: unknown, n: number): Buyer[] {
  const raw = (o as { buyers?: unknown })?.buyers;
  if (!Array.isArray(raw) || raw.length < 3) throw new Error('expected {buyers: [..]} with at least 3 people');
  return raw.slice(0, n).map((r, i) => {
    const b = (r ?? {}) as Record<string, unknown>;
    const p = (b.prices ?? {}) as Record<string, unknown>;
    const name = str(b.name, 40);
    if (!name) throw new Error(`buyers[${i}] needs a name`);
    return {
      id: i + 1,
      name,
      segment: str(b.segment, 40, 'Buyer'),
      bio: str(b.bio, 300),
      interest: Math.min(5, Math.max(1, Math.round(num(b.interest) || 3))),
      would_try: b.would_try === true,
      objection: str(b.objection, 200),
      must_have: str(b.must_have, 200),
      prices: { too_cheap: num(p.too_cheap), bargain: num(p.bargain), expensive: num(p.expensive), too_expensive: num(p.too_expensive) },
    };
  });
}

export async function askBuyers(llm: Llm, input: AdviceInput, market: Market | null): Promise<Buyer[]> {
  const unit = input.billing === 'subscription' ? `${input.currency} per month` : `${input.currency}, paid once`;
  return llm.json({
    system: 'You simulate realistic potential buyers for a product, each with their own budget and doubts. Be honest: most people are not excited by most products. Reply with JSON only.',
    user: [
      `Create ${input.buyers} potential buyers who could plausibly come across this product.`,
      `Product: ${input.product}\nWhat it does: ${input.pitch}`,
      `Who it is for: ${input.audience ?? 'infer the likely buyers from the pitch, and include a few who are only loosely in the market'}`,
      market ? `What people say about this space today: ${market.summary}\nExisting options: ${market.competitors.map((c) => `${c.name}${c.price ? ` (${c.price})` : ''}`).join(', ') || 'none found'}` : '',
      `For each buyer give: interest from 1 (would ignore it) to 5 (would buy today), whether they would try it, their main objection, the one thing it must do for them, and their answers in ${unit} to: at what price is it so cheap you would doubt its quality (too_cheap), a bargain (bargain), getting expensive but still worth considering (expensive), too expensive to consider (too_expensive).`,
      'Spread them across groups, budgets and levels of interest. Include skeptics and people happy with what they use now.',
      'JSON shape: {"buyers":[{"name":"","segment":"","bio":"1 sentence","interest":3,"would_try":true,"objection":"","must_have":"","prices":{"too_cheap":0,"bargain":0,"expensive":0,"too_expensive":0}}]}',
    ]
      .filter(Boolean)
      .join('\n\n'),
    validate: (o) => validateBuyers(o, input.buyers),
    temperature: 0.9,
    maxTokens: 6000,
  });
}

/** Counts the things several buyers said, most common first. */
function common(items: string[], max: number): string[] {
  const counts = new Map<string, { text: string; n: number }>();
  for (const t of items.filter(Boolean)) {
    const key = t.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').slice(0, 60);
    const c = counts.get(key);
    if (c) c.n++;
    else counts.set(key, { text: t, n: 1 });
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, max).map((c) => c.text);
}

export function receptionOf(buyers: Buyer[]): Reception | null {
  if (!buyers.length) return null;
  const mean = buyers.reduce((s, b) => s + b.interest, 0) / buyers.length;
  return {
    score: Math.round(((mean - 1) / 4) * 100),
    would_try_share: Math.round((buyers.filter((b) => b.would_try).length / buyers.length) * 100) / 100,
    objections: common(buyers.map((b) => b.objection), 5),
    must_haves: common(buyers.map((b) => b.must_have), 5),
  };
}
