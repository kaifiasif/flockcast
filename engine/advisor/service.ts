/**
 * The launch advisor an app embeds. Like rehearsals, every call names a scope and never reaches
 * outside it; runs happen in the background and are capped per scope per day, because each one
 * spends model calls and makes outside searches.
 */
import { randomUUID } from 'node:crypto';
import { RehearsalError } from '../core.ts';
import type { Llm } from '../llm.ts';
import { ADVISOR_AGENTS } from './agents.ts';
import { runAdvice } from './pipeline.ts';
import { ACTIVE_ADVICE, BILLING, CURRENCIES, type Advice, type AdviceInput, type AdviceStore, type Billing, type Currency, type SearchAdapter } from './types.ts';

export interface AdvisorLimits {
  runsPerScopePerDay: number;
  maxBuyers: number;
}
export const DEFAULT_ADVISOR_LIMITS: AdvisorLimits = { runsPerScopePerDay: 5, maxBuyers: 30 };

export interface CreateAdvisorOptions {
  store: AdviceStore;
  /** Null runs research only, labelled as such. */
  llm: Llm | null;
  search: SearchAdapter[];
  background?: (job: () => Promise<void>) => void;
  limits?: Partial<AdvisorLimits>;
  now?: () => Date;
  onError?: (e: unknown, ctx: { scope: string; id: string }) => void;
}

/** What a caller may send; everything is checked and trimmed here, whatever validated it before. */
export interface AdviceRequest {
  product: string;
  pitch: string;
  audience?: string | null;
  price_idea?: string | null;
  competitors?: string[];
  billing?: Billing;
  currency?: Currency;
  buyers?: number;
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function createAdvisor(opts: CreateAdvisorOptions) {
  const { store } = opts;
  const limits = { ...DEFAULT_ADVISOR_LIMITS, ...opts.limits };
  const now = opts.now ?? (() => new Date());
  const background = opts.background ?? ((job) => void job());
  // starts are also remembered here, so deleting finished runs does not reset the daily cap
  const started = new Map<string, number[]>();
  const startsSince = (scope: string, since: number) => (started.get(scope) ?? []).filter((t) => t > since);

  function inputOf(req: AdviceRequest): AdviceInput {
    const product = text(req.product, 80);
    const pitch = text(req.pitch, 2000);
    if (!product) throw new RehearsalError(400, 'INVALID', 'Give your product a name.');
    if (pitch.length < 20) throw new RehearsalError(400, 'INVALID', 'Describe what your product does in at least 20 characters.');
    const buyers = req.buyers ?? 12;
    if (!Number.isInteger(buyers) || buyers < 5 || buyers > limits.maxBuyers) throw new RehearsalError(400, 'INVALID', `Ask between 5 and ${limits.maxBuyers} buyers.`);
    const billing = req.billing ?? 'subscription';
    const currency = req.currency ?? 'USD';
    if (!BILLING.includes(billing)) throw new RehearsalError(400, 'INVALID', `Billing must be one of ${BILLING.join(', ')}.`);
    if (!CURRENCIES.includes(currency)) throw new RehearsalError(400, 'INVALID', `Currency must be one of ${CURRENCIES.join(', ')}.`);
    return {
      product,
      pitch,
      audience: text(req.audience, 500) || null,
      price_idea: text(req.price_idea, 120) || null,
      competitors: [...new Set((req.competitors ?? []).map((c) => text(c, 60)).filter(Boolean))].slice(0, 8),
      billing,
      currency,
      buyers,
    };
  }

  function find(scope: string, id: string): Advice {
    const row = store.get(scope, id);
    if (!row) throw new RehearsalError(404, 'NOT_FOUND', 'Advice not found.');
    return row;
  }

  async function execute(row: Advice): Promise<void> {
    const set = (patch: Partial<Advice>) => store.update(row.scope, row.id, patch);
    try {
      const result = await runAdvice(row.input, { llm: opts.llm, search: opts.search, onStep: (status, p) => set({ status, progress: Math.round(p * 100) }) });
      set({ status: 'done', progress: 100, result, finished_at: now().toISOString() });
    } catch (e) {
      opts.onError?.(e, { scope: row.scope, id: row.id });
      set({ status: 'failed', error: (e as Error).message.slice(0, 500), finished_at: now().toISOString() });
    }
  }

  return {
    limits,
    agents: ADVISOR_AGENTS,
    mode: opts.llm ? ('full' as const) : ('offline' as const),
    sources: opts.search.map((s) => s.name),

    start(scope: string, req: AdviceRequest): Advice {
      const input = inputOf(req);
      const dayAgo = now().getTime() - 86_400_000;
      const kept = startsSince(scope, dayAgo);
      const recent = Math.max(store.countSince(scope, new Date(dayAgo).toISOString()), kept.length);
      if (recent >= limits.runsPerScopePerDay) throw new RehearsalError(429, 'RATE_LIMITED', `You've asked for launch advice ${recent} times today. Try again tomorrow.`);
      const row: Advice = { id: randomUUID(), scope, title: input.product, status: 'queued', progress: 0, input, result: null, error: null, created_at: now().toISOString(), finished_at: null };
      store.insert(row);
      started.set(scope, [...kept, now().getTime()]);
      background(() => execute(row));
      return row;
    },

    get: (scope: string, id: string): Advice => find(scope, id),

    list: (scope: string, o: { limit?: number } = {}): Advice[] => store.list(scope, { limit: Math.min(Math.max(o.limit ?? 50, 1), 200) }),

    remove(scope: string, id: string): void {
      const row = find(scope, id);
      if (ACTIVE_ADVICE.includes(row.status)) throw new RehearsalError(409, 'NOT_READY', 'This advice is still being worked on. Delete it once it finishes.');
      store.remove(scope, id);
    },

    recover: (): number => store.failStale(now().toISOString()),
  };
}

export type Advisor = ReturnType<typeof createAdvisor>;
