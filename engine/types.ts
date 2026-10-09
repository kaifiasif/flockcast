/**
 * Shared shapes for the rehearsal engine. Nothing here knows about any one app: an app plugs in a
 * content source, a store and a model, and gets rehearsals back.
 */

export type Stance = 'supportive' | 'skeptical' | 'neutral';
export type EngineKind = 'swarm' | 'swarm-offline' | 'mirofish';
export type RehearsalStatus = 'queued' | 'preparing' | 'running' | 'reporting' | 'done' | 'failed';
export const ACTIVE_STATUSES: readonly RehearsalStatus[] = ['queued', 'preparing', 'running', 'reporting'];

/** What gets rehearsed: the post (or thread parts), optional sentence ids, and past posts to model followers on. */
export interface RehearsalInput {
  posts: string[];
  /** Sentences the per-sentence reactions are reported against. Ids are the caller's; null is fine. */
  sentences?: { id: string | null; text: string }[];
  /** Past posts by the same author. Personas are modelled on who would read these. */
  examples?: { text: string; published_at?: string | null }[];
}

export interface RehearsalSettings {
  rounds: number;
  personas: number;
  /** Follower groups, one per line. Null uses the engine's default mix. */
  audience: string | null;
  /** How the author appears inside the simulation. */
  handle: string;
  /** A platform id from PLATFORMS. */
  platform: string;
}

export interface Persona {
  id: number;
  name: string;
  segment: string;
  bio: string;
  interests: string[];
  stance: Stance;
  activity: number;
  follows_author: boolean;
}

export interface RehearsalReply {
  agent_id: number;
  agent_name: string;
  round: number | null;
  kind: 'reply' | 'quote';
  text: string;
  stance: 'pushback' | 'other';
}

export interface SentenceReaction {
  id: string | null;
  text: string;
  mentions: number;
  pushback: number;
  examples: string[];
}

export interface RehearsalResult {
  engine: EngineKind;
  model: string | null;
  model_calls: number;
  platform: string;
  personas: { id: number; name: string; segment: string; stance: Stance; bio: string }[];
  /** False only when an external engine paraphrased the post instead of posting it word for word. */
  draft_seeded: boolean;
  draft_match: number;
  agents: number;
  rounds: number | null;
  total_actions: number;
  counts: { likes: number; reposts: number; quotes: number; replies: number; dislikes: number };
  replies: RehearsalReply[];
  related: { agent_id: number; text: string; stance: 'pushback' | 'other' }[];
  sentences: SentenceReaction[];
  pushback_share: number;
  report: { markdown: string } | null;
  report_error?: string;
}

export interface Interview {
  agent_id: number;
  prompt: string;
  answer: string;
  at: string;
}

/** The public shape of one rehearsal. */
export interface Rehearsal {
  id: string;
  scope: string;
  subject: string;
  source: string;
  title: string;
  status: RehearsalStatus;
  progress: number;
  settings: RehearsalSettings;
  /** The text that was rehearsed: one post, or the parts of a thread. */
  posts: string[];
  result: RehearsalResult | null;
  interviews: Interview[];
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

export type OnStage = (status: RehearsalStatus, progress: number) => void;

/** A simulator. The built-in swarm and the optional MiroFish backend both implement this. */
export interface Engine {
  readonly kind: EngineKind;
  readonly canInterview: boolean;
  /** Model name for display, or null offline. */
  readonly model: string | null;
  run(args: { input: RehearsalInput; settings: RehearsalSettings; onStage: OnStage }): Promise<{ result: RehearsalResult; state: unknown }>;
  interview(args: { state: unknown; agentId: number; question: string }): Promise<string>;
}

/**
 * Where the text comes from. `text` takes it from the request; an app adapter (see sources/creator-os)
 * reads its own tables and can keep a rehearsal closed until the app says so (the gate).
 */
export interface Source {
  readonly name: string;
  load(scope: string, ref: unknown): SourceLoad | Promise<SourceLoad>;
}

export interface SourceLoad {
  /** Stable key for "the thing being rehearsed": rehearsals of the same subject are a history. */
  subject: string;
  title: string;
  input: RehearsalInput;
  /** Closed gates refuse to start, with the reason shown to the person. */
  gate?: { open: boolean; reason?: string };
}

/** One stored rehearsal, as the store keeps it. Every read and write is bounded to one scope. */
export interface StoredRehearsal extends Omit<Rehearsal, 'interviews'> {
  text_hash: string;
  state: unknown;
  interviews: Interview[];
}

export interface Store {
  insert(row: StoredRehearsal): void;
  update(scope: string, id: string, patch: Partial<StoredRehearsal>): void;
  get(scope: string, id: string): StoredRehearsal | undefined;
  latest(scope: string, subject: string): StoredRehearsal | undefined;
  list(scope: string, opts?: { subject?: string; limit?: number }): StoredRehearsal[];
  countSince(scope: string, subject: string, sinceIso: string): number;
  remove(scope: string, id: string): boolean;
  /** Marks rehearsals left mid-run by a restart as failed. Returns how many. */
  failStale(beforeIso: string): number;
}
