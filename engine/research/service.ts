/**
 * Studies an app embeds. Like rehearsals, every call names a scope and never reaches outside it; runs
 * happen in the background and are capped per scope per day, because each spends model calls.
 */
import { randomUUID } from 'node:crypto';
import { brandOf, RehearsalError } from '../core.ts';
import type { Agents } from '../agents.ts';
import type { BrandRules } from '../types.ts';
import { AGENT_FOR, RESEARCH_AGENTS } from './agents.ts';
import { ACTIVE_STUDY, STAKEHOLDERS, type Segment, type Stakeholder, type Study, type StudyInput, type StudyKind, type StudyResult, type StudyStatus, type StudyStore } from './types.ts';

export interface ResearchLimits {
  runsPerScopePerDay: number;
  /** The most people in one study, across all its groups. */
  maxPanel: number;
}
export const DEFAULT_RESEARCH_LIMITS: ResearchLimits = { runsPerScopePerDay: 10, maxPanel: 50 };

export interface CreateResearchOptions {
  store: StudyStore;
  agents: Agents;
  background?: (job: () => Promise<void>) => void;
  limits?: Partial<ResearchLimits>;
  now?: () => Date;
  onError?: (e: unknown, ctx: { scope: string; id: string }) => void;
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const bad = (message: string) => new RehearsalError(400, 'INVALID', message);

function segmentsOf(v: unknown, max: number): Segment[] {
  const seen = new Set<string>();
  const out: Segment[] = [];
  for (const s of Array.isArray(v) ? v : []) {
    const name = text((s as Segment)?.name, 40);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, about: text((s as Segment)?.about, 300) });
  }
  if (!out.length) throw bad('Name at least one group of people.');
  if (out.length > max) throw bad(`Use up to ${max} groups.`);
  return out;
}

const count = (v: unknown, lo: number, hi: number, what: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw bad(`${what} must be a whole number from ${lo} to ${hi}.`);
  return n;
};

export function createResearch(opts: CreateResearchOptions) {
  const { store } = opts;
  const limits = { ...DEFAULT_RESEARCH_LIMITS, ...opts.limits };
  const now = opts.now ?? (() => new Date());
  const background = opts.background ?? ((job) => void job());
  const started = new Map<string, number[]>();

  /** Everything is checked and trimmed here, whatever validated it before. */
  function inputOf(raw: StudyInput): StudyInput {
    if (raw.kind === 'focus_group') {
      const questions = (raw.questions ?? []).map((q) => text(q, 300)).filter(Boolean);
      const material = text(raw.material, 4000);
      if (!material) throw bad('Add what the group should see.');
      if (!questions.length || questions.length > 5) throw bad('Ask between one and five questions.');
      return { kind: 'focus_group', topic: text(raw.topic, 120) || 'Focus group', material, questions, segments: segmentsOf(raw.segments, 4), panelists: count(raw.panelists ?? 8, 4, Math.min(12, limits.maxPanel), 'Panelists') };
    }
    if (raw.kind === 'message_test') {
      const messages = (raw.messages ?? []).map((m, i) => ({ label: text(m?.label, 40) || `Version ${'ABCD'[i]}`, text: text(m?.text, 2000) })).filter((m) => m.text);
      if (messages.length < 2 || messages.length > 4) throw bad('Test between two and four versions.');
      const segments = segmentsOf(raw.segments, 5);
      const per = count(raw.per_segment ?? 5, 2, 10, 'People per group');
      if (per * segments.length > limits.maxPanel) throw bad(`That is ${per * segments.length} people; the most is ${limits.maxPanel}.`);
      return { kind: 'message_test', goal: text(raw.goal, 300) || null, messages, segments, per_segment: per };
    }
    if (raw.kind === 'crisis') {
      const situation = text(raw.situation, 2000);
      const statement = text(raw.statement, 3000);
      if (!situation) throw bad('Describe what happened.');
      if (!statement) throw bad('Add the statement you plan to put out.');
      const stakeholders = [...new Set(raw.stakeholders ?? [])].filter((g): g is Stakeholder => (STAKEHOLDERS as readonly string[]).includes(g));
      return { kind: 'crisis', situation, statement, stakeholders: stakeholders.length ? stakeholders : ['customers', 'press', 'critics'], rounds: raw.rounds === 1 ? 1 : 2 };
    }
    throw bad('Pick a kind of study: focus_group, message_test or crisis.');
  }

  const titleOf = (i: StudyInput) => (i.kind === 'focus_group' ? i.topic : i.kind === 'message_test' ? i.goal || i.messages[0].text : i.situation).replace(/\s+/g, ' ').slice(0, 80);

  function find(scope: string, id: string): Study {
    const row = store.get(scope, id);
    if (!row) throw new RehearsalError(404, 'NOT_FOUND', 'Study not found.');
    return row;
  }

  async function execute(row: Study, brand: BrandRules | null): Promise<void> {
    const set = (patch: Parameters<StudyStore['update']>[2]) => store.update(row.scope, row.id, patch);
    try {
      const { result } = await opts.agents.run<{ result: StudyResult }>('study', { kind: row.kind, input: row.input, brand }, (status, progress) => set({ status: status as StudyStatus, progress }));
      set({ status: 'done', progress: 100, result, finished_at: now().toISOString() });
    } catch (e) {
      opts.onError?.(e, { scope: row.scope, id: row.id });
      set({ status: 'failed', error: (e as Error).message.slice(0, 500), finished_at: now().toISOString() });
    }
  }

  return {
    limits,
    agents: RESEARCH_AGENTS,
    agentFor: AGENT_FOR,
    mode: opts.agents.llm ? ('full' as const) : ('offline' as const),

    /** Brand rules, when given, are checked against each version of a message test. */
    start(scope: string, raw: StudyInput, o: { brand?: unknown } = {}): Study {
      const input = inputOf(raw);
      const dayAgo = now().getTime() - 86_400_000;
      const kept = (started.get(scope) ?? []).filter((t) => t > dayAgo);
      const recent = Math.max(store.countSince(scope, new Date(dayAgo).toISOString()), kept.length);
      if (recent >= limits.runsPerScopePerDay) throw new RehearsalError(429, 'RATE_LIMITED', `This project has run ${recent} studies today. Try again tomorrow.`);
      const row: Study = { id: randomUUID(), scope, kind: input.kind, title: titleOf(input), status: 'queued', progress: 0, input, result: null, error: null, created_at: now().toISOString(), finished_at: null };
      store.insert(row);
      started.set(scope, [...kept, now().getTime()]);
      background(() => execute(row, input.kind === 'message_test' ? brandOf(o.brand) : null));
      return row;
    },

    get: (scope: string, id: string): Study => find(scope, id),

    list: (scope: string, o: { limit?: number; kind?: StudyKind } = {}): Study[] => store.list(scope, { kind: o.kind, limit: Math.min(Math.max(o.limit ?? 50, 1), 200) }),

    remove(scope: string, id: string): void {
      const row = find(scope, id);
      if (ACTIVE_STUDY.includes(row.status)) throw new RehearsalError(409, 'NOT_READY', 'This study is still running. Delete it once it finishes.');
      store.remove(scope, id);
    },

    recover: (): number => store.failStale(now().toISOString()),
  };
}

export type Research = ReturnType<typeof createResearch>;
