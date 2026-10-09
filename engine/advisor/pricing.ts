/**
 * Price sensitivity from the simulated buyers' four answers (Van Westendorp), and the prices people
 * are used to seeing. Pure functions: the numbers come from the answers, never from the model's say-so.
 */
import type { Billing, Currency, PriceAnswers, PriceRange } from './types.ts';

/** Each buyer's answers sorted into order, so a muddled answer still reads as a range. */
export function ordered(a: PriceAnswers): PriceAnswers {
  const [too_cheap, bargain, expensive, too_expensive] = [a.too_cheap, a.bargain, a.expensive, a.too_expensive].map((v) => Math.max(0, v)).sort((x, y) => x - y);
  return { too_cheap, bargain, expensive, too_expensive };
}

const share = (xs: number[], test: (x: number) => boolean) => xs.filter(test).length / xs.length;

/** The price where two curves cross: the grid point with the smallest gap. */
function crossing(grid: number[], a: (p: number) => number, b: (p: number) => number): number {
  let best = grid[0];
  let gap = Infinity;
  for (const p of grid) {
    const g = Math.abs(a(p) - b(p));
    if (g < gap - 1e-9) {
      gap = g;
      best = p;
    }
  }
  return best;
}

export function priceRange(answers: PriceAnswers[]): PriceRange | null {
  const all = answers.map(ordered).filter((a) => a.too_expensive > 0);
  if (all.length < 3) return null;
  const tc = all.map((a) => a.too_cheap);
  const ch = all.map((a) => a.bargain);
  const ex = all.map((a) => a.expensive);
  const te = all.map((a) => a.too_expensive);
  const top = Math.max(...te);
  const grid = Array.from({ length: 401 }, (_, i) => (top * 1.2 * i) / 400);
  const tooCheap = (p: number) => share(tc, (x) => x >= p);
  const cheap = (p: number) => share(ch, (x) => x >= p);
  const expensive = (p: number) => share(ex, (x) => x <= p);
  const tooExpensive = (p: number) => share(te, (x) => x <= p);
  const low = crossing(grid, tooCheap, (p) => 1 - cheap(p));
  const high = crossing(grid, tooExpensive, (p) => 1 - expensive(p));
  const optimal = crossing(grid, tooCheap, tooExpensive);
  const indifferent = crossing(grid, cheap, expensive);
  const r = (x: number) => Math.round(x * 100) / 100;
  return { low: r(Math.min(low, high)), high: r(Math.max(low, high)), optimal: r(optimal), indifferent: r(indifferent) };
}

/** Prices people are used to: 9, 19, 49, 99, 149, 499, 999... and 0.99 to 8.99 below that. */
const ANCHORS: number[] = (() => {
  const out = [0.99, 1.99, 2.99, 3.99, 4.99, 5.99, 6.99, 7.99, 8.99];
  for (let v = 9; v <= 99; v += 10) out.push(v);
  for (let v = 149; v <= 999; v += 50) out.push(v);
  for (let v = 1499; v <= 9999; v += 500) out.push(v);
  for (let v = 14999; v <= 99999; v += 5000) out.push(v);
  return out;
})();
/** Rupee prices end in 9 at whole hundreds: 99, 199, 499, 999, 1,499. */
const INR_ANCHORS: number[] = (() => {
  const out = [9, 19, 29, 49, 79, 99];
  for (let v = 149; v <= 999; v += 50) out.push(v);
  for (let v = 1499; v <= 99999; v += 500) out.push(v);
  return out;
})();

export function friendlyPrice(v: number, currency: Currency): number {
  if (v <= 0) return 0;
  const anchors = currency === 'INR' ? INR_ANCHORS : ANCHORS;
  let best = anchors[0];
  for (const a of anchors) if (Math.abs(Math.log(a / v)) < Math.abs(Math.log(best / v))) best = a;
  return best;
}

export interface PricePoints {
  /** The plan most people should pick. */
  hero: number;
  /** The plan above it, which makes the hero look like good value. */
  top: number;
  /** Yearly prices are about 20% off twelve months. */
  heroYearly: number | null;
  topYearly: number | null;
}

/**
 * The hero sits between the optimal and the indifference price, kept inside the acceptable range;
 * the top plan is about two and a half times that.
 */
export function pricePoints(range: PriceRange, billing: Billing, currency: Currency): PricePoints {
  const mid = (range.optimal + range.indifferent) / 2;
  const hero = friendlyPrice(Math.min(Math.max(mid, range.low), range.high) || range.optimal, currency);
  const top = friendlyPrice(hero * 2.5, currency);
  const yearly = (m: number) => (billing === 'subscription' ? Math.round(m * 12 * 0.8) : null);
  return { hero, top, heroYearly: yearly(hero), topYearly: yearly(top) };
}
