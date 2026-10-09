/**
 * Shapes for the launch advisor: given a product, it reads what people say about the space, asks a
 * simulated set of buyers what they would pay, and writes a plan a first-time founder can follow.
 */

export type AdviceStatus = 'queued' | 'researching' | 'simulating' | 'deciding' | 'done' | 'failed';
export const ACTIVE_ADVICE: readonly AdviceStatus[] = ['queued', 'researching', 'simulating', 'deciding'];

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const BILLING = ['subscription', 'one_time'] as const;
export type Billing = (typeof BILLING)[number];

/** What the person tells the advisor about their product. */
export interface AdviceInput {
  product: string;
  /** What it does and why someone would want it, in their own words. */
  pitch: string;
  /** Who it is for. Null lets the advisor infer buyers from the pitch. */
  audience: string | null;
  /** The price they had in mind, as free text ("around $10 a month"). */
  price_idea: string | null;
  /** Products they already know compete with theirs. */
  competitors: string[];
  billing: Billing;
  currency: Currency;
  /** Simulated buyers to ask. */
  buyers: number;
}

/** One page or comment found on the web. Ids are assigned in order (f1, f2, ...) so the plan can cite them. */
export interface Finding {
  id: string;
  source: string;
  title: string;
  text: string;
  url: string;
  date: string | null;
  score: number | null;
}

export interface SearchStatus {
  source: string;
  ok: boolean;
  found: number;
  error?: string;
}

export interface Competitor {
  name: string;
  what: string;
  price: string | null;
  strength: string;
  weakness: string;
  /** A finding id that mentions it, or null when the person named it or the model knew it. */
  finding: string | null;
}

export type VoiceKind = 'pain' | 'praise' | 'doubt' | 'request';
export interface Voice {
  kind: VoiceKind;
  /** Verbatim from the finding's text; anything that is not is dropped. */
  quote: string;
  finding: string;
}

export interface Market {
  summary: string;
  competitors: Competitor[];
  voices: Voice[];
  price_signals: string[];
}

export interface PriceAnswers {
  too_cheap: number;
  bargain: number;
  expensive: number;
  too_expensive: number;
}

export interface Buyer {
  id: number;
  name: string;
  segment: string;
  bio: string;
  /** 1 (not interested) to 5 (wants it now). */
  interest: number;
  would_try: boolean;
  objection: string;
  must_have: string;
  prices: PriceAnswers;
}

export interface Reception {
  /** Mean interest scaled to 0-100. */
  score: number;
  would_try_share: number;
  objections: string[];
  must_haves: string[];
}

/** Van Westendorp price-sensitivity points, read from the buyers' four answers. */
export interface PriceRange {
  /** Point of marginal cheapness: below this, too many think it is too cheap to be good. */
  low: number;
  /** Point of marginal expensiveness: above this, too many think it is too expensive. */
  high: number;
  optimal: number;
  indifferent: number;
}

export interface Tier {
  name: string;
  monthly: number | null;
  yearly: number | null;
  one_time: number | null;
  who: string;
  includes: string[];
  hero: boolean;
}

export interface Pricing {
  currency: Currency;
  billing: Billing;
  range: PriceRange;
  tiers: Tier[];
  why: string;
}

export type Verdict = 'go' | 'go_with_changes' | 'rethink';

export interface Feature {
  name: string;
  why: string;
  effort: 'small' | 'medium' | 'large';
  finding: string | null;
}

export interface Plan {
  verdict: Verdict;
  headline: string;
  reasons: string[];
  features: Feature[];
  steps: string[];
  risks: string[];
  launch_post: string;
}

export interface AdviceResult {
  /** full: researched and simulated with a model. offline: web research only, no model key. */
  mode: 'full' | 'offline';
  model: string | null;
  model_calls: number;
  queries: string[];
  searched: SearchStatus[];
  findings: Finding[];
  market: Market | null;
  buyers: Buyer[];
  reception: Reception | null;
  pricing: Pricing | null;
  plan: Plan | null;
}

export interface Advice {
  id: string;
  scope: string;
  title: string;
  status: AdviceStatus;
  progress: number;
  input: AdviceInput;
  result: AdviceResult | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface AdviceStore {
  insert(row: Advice): void;
  update(scope: string, id: string, patch: Partial<Advice>): void;
  get(scope: string, id: string): Advice | undefined;
  list(scope: string, opts?: { limit?: number }): Advice[];
  countSince(scope: string, sinceIso: string): number;
  remove(scope: string, id: string): boolean;
  failStale(atIso: string): number;
}

/** Where Bramble the Scout searches. Each name maps to one fixed host in agents/flockcast_agents/advisor/search.py. */
export const SEARCH_SOURCES = ['hackernews', 'reddit', 'web', 'sample'] as const;
export type SearchSource = (typeof SEARCH_SOURCES)[number];
