/**
 * How close rehearsals came to what really happened, from the numbers authors enter after posting.
 * A simulated crowd of a dozen people cannot predict reach, so this compares the mix of reactions
 * (how likes, reposts, replies and quotes split) and, for compared drafts, whether the draft the
 * rehearsal favoured was the one that did best for real.
 */
import type { Outcome, Rehearsal } from './types.ts';

const KINDS = ['likes', 'reposts', 'replies', 'quotes'] as const;
type Mix = Record<(typeof KINDS)[number], number>;

function mixOf(counts: Mix): Mix | null {
  const total = KINDS.reduce((n, k) => n + counts[k], 0);
  if (!total) return null;
  return Object.fromEntries(KINDS.map((k) => [k, counts[k] / total])) as Mix;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** 1 when the reactions split the same way, 0 when they share nothing. Null when either side is empty. */
export function mixMatch(simulated: Mix, real: Mix): number | null {
  const a = mixOf(simulated);
  const b = mixOf(real);
  if (!a || !b) return null;
  return round2(1 - KINDS.reduce((n, k) => n + Math.abs(a[k] - b[k]), 0) / 2);
}

/** Engagement per simulated follower: what a rehearsal "favours" when drafts are compared. */
const simScore = (r: Rehearsal) => (r.result ? (r.result.counts.likes + 2 * r.result.counts.reposts + 2 * r.result.counts.quotes + r.result.counts.replies) / Math.max(1, r.result.agents) : 0);
const realScore = (o: Outcome) => o.likes + 2 * o.reposts + 2 * o.quotes + o.replies;

export interface Calibration {
  /** Rehearsals with real numbers entered. */
  count: number;
  /** Average reaction-mix match, 0 to 1. Null until a rehearsal has numbers on both sides. */
  average_match: number | null;
  items: { id: string; title: string; variant: string | null; match: number | null; simulated: Mix; real: Mix; recorded_at: string }[];
  /** Compared drafts with real numbers for at least two of them. */
  comparisons: { group_id: string; picked: string; best: string; agreed: boolean }[];
  /** Share of comparisons where the rehearsal's pick was the real winner. */
  pick_rate: number | null;
}

export function calibrate(rehearsals: Rehearsal[]): Calibration {
  const scored = rehearsals.filter((r) => r.outcome && r.result);
  const items = scored.map((r) => {
    const { likes, reposts, replies, quotes } = r.result!.counts;
    const simulated = { likes, reposts, replies, quotes };
    const real = { likes: r.outcome!.likes, reposts: r.outcome!.reposts, replies: r.outcome!.replies, quotes: r.outcome!.quotes };
    return { id: r.id, title: r.title, variant: r.variant, match: mixMatch(simulated, real), simulated, real, recorded_at: r.outcome!.recorded_at };
  });
  const matches = items.map((i) => i.match).filter((m): m is number => m !== null);

  const groups = new Map<string, Rehearsal[]>();
  for (const r of scored) if (r.group_id && r.variant) groups.set(r.group_id, [...(groups.get(r.group_id) ?? []), r]);
  const comparisons = [...groups].filter(([, rs]) => rs.length >= 2).map(([group_id, rs]) => {
    const picked = rs.reduce((a, b) => (simScore(b) > simScore(a) ? b : a)).variant!;
    const best = rs.reduce((a, b) => (realScore(b.outcome!) > realScore(a.outcome!) ? b : a)).variant!;
    return { group_id, picked, best, agreed: picked === best };
  });

  return {
    count: items.length,
    average_match: matches.length ? round2(matches.reduce((a, b) => a + b, 0) / matches.length) : null,
    items,
    comparisons,
    pick_rate: comparisons.length ? round2(comparisons.filter((c) => c.agreed).length / comparisons.length) : null,
  };
}
