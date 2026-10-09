/**
 * The rehearsal service an app embeds: it owns the job lifecycle, the spend caps and the scope rule,
 * and leaves where text comes from (sources), where rows live (store) and how people are simulated
 * (engine) to adapters.
 *
 * Scope: every call names a scope (a project id, a user id: whatever the app isolates by). A rehearsal is
 * only ever read or changed through its own scope, so one tenant cannot reach another's by id.
 */
import { createHash, randomUUID } from 'node:crypto';
import { platformOf } from './platforms.ts';
import type { Engine, Interview, Rehearsal, RehearsalSettings, Source, Store, StoredRehearsal } from './types.ts';
import { ACTIVE_STATUSES } from './types.ts';

export type RehearsalErrorCode = 'NOT_FOUND' | 'INVALID' | 'GATE_CLOSED' | 'NOT_READY' | 'NO_INTERVIEWS' | 'RATE_LIMITED' | 'MODEL_FAILED' | 'UNKNOWN_SOURCE';

/** Every refusal carries an HTTP-style status and a stable code; messages are written for people. */
export class RehearsalError extends Error {
  override name = 'RehearsalError';
  readonly status: number;
  readonly code: RehearsalErrorCode;
  constructor(status: number, code: RehearsalErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface Limits {
  /** New rehearsals of one subject in 24 hours. Reruns of unchanged text return the last result for free. */
  rehearsalsPerSubjectPerDay: number;
  interviewsPerRehearsal: number;
  maxRounds: number;
  maxPersonas: number;
  /** Characters across all posts of one rehearsal. */
  maxTextChars: number;
}

export const DEFAULT_LIMITS: Limits = { rehearsalsPerSubjectPerDay: 10, interviewsPerRehearsal: 25, maxRounds: 40, maxPersonas: 30, maxTextChars: 10_000 };

export const DEFAULT_SETTINGS: RehearsalSettings = { rounds: 10, personas: 12, audience: null, handle: 'the author', platform: 'x' };

export interface StartRequest {
  /** Source name; defaults to "text". */
  source?: string;
  /** What the source needs to find the text: for "text", `{ text }` or `{ posts }`. */
  ref?: unknown;
  settings?: Partial<RehearsalSettings>;
  /** Run again even when the text is unchanged since the last finished rehearsal. */
  force?: boolean;
}

export interface CreateRehearsalsOptions {
  store: Store;
  engine: Engine;
  sources: Source[];
  /** Runs a job off the request path. Defaults to fire-and-forget. */
  background?: (job: () => Promise<void>) => void;
  limits?: Partial<Limits>;
  defaults?: Partial<RehearsalSettings>;
  now?: () => Date;
  /** Receives job failures with the full error, for the server log. People only see the message. */
  onError?: (e: unknown, ctx: { scope: string; id: string }) => void;
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

const toPublic = (r: StoredRehearsal): Rehearsal => ({
  id: r.id,
  scope: r.scope,
  subject: r.subject,
  source: r.source,
  title: r.title,
  status: r.status,
  progress: r.progress,
  settings: r.settings,
  posts: r.posts,
  result: r.result,
  interviews: r.interviews,
  error: r.error,
  created_at: r.created_at,
  finished_at: r.finished_at,
});

function clampInt(v: unknown, lo: number, hi: number, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw new RehearsalError(400, 'INVALID', `${name} must be a whole number from ${lo} to ${hi}.`);
  return n;
}

export function createRehearsals(opts: CreateRehearsalsOptions) {
  const { store, engine } = opts;
  const limits: Limits = { ...DEFAULT_LIMITS, ...opts.limits };
  const base: RehearsalSettings = { ...DEFAULT_SETTINGS, ...opts.defaults };
  const sources = new Map(opts.sources.map((s) => [s.name, s]));
  const now = opts.now ?? (() => new Date());
  const background = opts.background ?? ((job) => void job());

  function settingsOf(over: Partial<RehearsalSettings> = {}): RehearsalSettings {
    const s = { ...base, ...Object.fromEntries(Object.entries(over).filter(([, v]) => v !== undefined)) };
    const audience = s.audience == null ? null : String(s.audience).trim().slice(0, 2000) || null;
    const handle = String(s.handle ?? '').trim().slice(0, 60) || DEFAULT_SETTINGS.handle;
    return {
      rounds: clampInt(s.rounds, 1, limits.maxRounds, 'rounds'),
      personas: clampInt(s.personas, 2, limits.maxPersonas, 'personas'),
      audience,
      handle,
      platform: platformOf(s.platform).id,
    };
  }

  function find(scope: string, id: string): StoredRehearsal {
    const row = store.get(scope, id);
    if (!row) throw new RehearsalError(404, 'NOT_FOUND', 'Rehearsal not found.');
    return row;
  }

  async function execute(row: StoredRehearsal, input: Parameters<Engine['run']>[0]['input']): Promise<void> {
    const set = (patch: Partial<StoredRehearsal>) => store.update(row.scope, row.id, patch);
    try {
      const { result, state } = await engine.run({ input, settings: row.settings, onStage: (status, progress) => set({ status, progress }) });
      set({ status: 'done', progress: 100, result, state, finished_at: now().toISOString() });
    } catch (e) {
      opts.onError?.(e, { scope: row.scope, id: row.id });
      set({ status: 'failed', error: (e as Error).message.slice(0, 500), finished_at: now().toISOString() });
    }
  }

  return {
    limits,
    defaults: base,
    engine: { kind: engine.kind, model: engine.model, interviews: engine.canInterview },
    sources: [...sources.keys()],

    /**
     * Starts a rehearsal, or returns the one already running for this subject, or the finished one
     * when the text has not changed (unless forced). Returns at once; the work runs in the background.
     */
    async start(scope: string, req: StartRequest = {}): Promise<Rehearsal> {
      const source = sources.get(req.source ?? 'text');
      if (!source) throw new RehearsalError(400, 'UNKNOWN_SOURCE', `Unknown source "${req.source}". Available: ${[...sources.keys()].join(', ')}.`);
      const settings = settingsOf(req.settings);
      const loaded = await source.load(scope, req.ref);
      if (loaded.gate && !loaded.gate.open) throw new RehearsalError(409, 'GATE_CLOSED', loaded.gate.reason ?? 'This cannot be rehearsed yet.');
      const posts = loaded.input.posts.map((p) => String(p).trim());
      if (!posts.length || posts.some((p) => !p)) throw new RehearsalError(400, 'INVALID', 'There is no text to rehearse.');
      if (posts.join('').length > limits.maxTextChars) throw new RehearsalError(400, 'INVALID', `Keep the text under ${limits.maxTextChars} characters.`);

      const textHash = sha256(JSON.stringify([posts, settings]));
      const prev = store.latest(scope, loaded.subject);
      if (prev && ACTIVE_STATUSES.includes(prev.status)) return toPublic(prev);
      if (prev && prev.status === 'done' && prev.text_hash === textHash && !req.force) return toPublic(prev);

      const dayAgo = new Date(now().getTime() - 86_400_000).toISOString();
      const recent = store.countSince(scope, loaded.subject, dayAgo);
      if (recent >= limits.rehearsalsPerSubjectPerDay) {
        throw new RehearsalError(429, 'RATE_LIMITED', `This has been rehearsed ${recent} times in the last day. Try again tomorrow.`);
      }

      const row: StoredRehearsal = {
        id: randomUUID(),
        scope,
        subject: loaded.subject,
        source: source.name,
        title: loaded.title.slice(0, 120),
        status: 'queued',
        progress: 0,
        settings,
        posts,
        result: null,
        state: null,
        interviews: [],
        error: null,
        text_hash: textHash,
        created_at: now().toISOString(),
        finished_at: null,
      };
      store.insert(row);
      background(() => execute(row, { ...loaded.input, posts }));
      return toPublic(row);
    },

    get(scope: string, id: string): Rehearsal {
      return toPublic(find(scope, id));
    },

    latest(scope: string, subject: string): Rehearsal | null {
      const row = store.latest(scope, subject);
      return row ? toPublic(row) : null;
    },

    list(scope: string, opts: { subject?: string; limit?: number } = {}): Rehearsal[] {
      return store.list(scope, { subject: opts.subject, limit: Math.min(Math.max(opts.limit ?? 50, 1), 200) }).map(toPublic);
    },

    remove(scope: string, id: string): void {
      const row = find(scope, id);
      if (ACTIVE_STATUSES.includes(row.status)) throw new RehearsalError(409, 'NOT_READY', 'This rehearsal is still running. Delete it once it finishes.');
      store.remove(scope, id);
    },

    /** Asks one simulated person a question, from what they did in this rehearsal. */
    async interview(scope: string, id: string, body: { agent_id: number; prompt: string }): Promise<Interview> {
      const row = find(scope, id);
      if (row.status !== 'done') throw new RehearsalError(409, 'NOT_READY', 'The rehearsal has not finished yet.');
      if (!engine.canInterview) throw new RehearsalError(409, 'NO_INTERVIEWS', 'Asking followers questions needs a model key. This rehearsal ran as an offline estimate.');
      if (row.result?.engine === 'swarm-offline') throw new RehearsalError(409, 'NO_INTERVIEWS', 'This rehearsal ran as an offline estimate, so its followers cannot answer. Run it again with a model key.');
      const agentId = clampInt(body.agent_id, 1, 10_000, 'agent_id');
      const q = String(body.prompt ?? '').trim();
      if (!q || q.length > 1000) throw new RehearsalError(400, 'INVALID', 'Ask a question of 1 to 1000 characters.');
      if (row.interviews.length >= limits.interviewsPerRehearsal) {
        throw new RehearsalError(429, 'RATE_LIMITED', `You've asked ${limits.interviewsPerRehearsal} questions on this rehearsal. Start a new one to ask more.`);
      }
      let answer: string;
      try {
        answer = await engine.interview({ state: row.state, agentId, question: q });
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status) throw new RehearsalError(status, status === 404 ? 'NOT_FOUND' : 'INVALID', (e as Error).message);
        opts.onError?.(e, { scope, id });
        throw new RehearsalError(424, 'MODEL_FAILED', `The model could not answer: ${(e as Error).message}`);
      }
      const entry: Interview = { agent_id: agentId, prompt: q, answer, at: now().toISOString() };
      // re-read so two questions asked at once both land
      const fresh = find(scope, id);
      store.update(scope, id, { interviews: [...fresh.interviews, entry] });
      return entry;
    },

    /** Call at boot: anything still "running" was cut off by the restart. */
    recover(): number {
      return store.failStale(now().toISOString());
    },
  };
}

export type Rehearsals = ReturnType<typeof createRehearsals>;
