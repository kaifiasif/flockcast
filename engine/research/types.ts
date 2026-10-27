/**
 * Studies go past one post: a focus group discusses material, a message test scores versions on several
 * groups at once, and a crisis rehearsal tries a statement on the people a hard moment touches. All are
 * simulated, so results are a rehearsal of the conversation, never research data.
 */

export const STUDY_KINDS = ['focus_group', 'message_test', 'crisis'] as const;
export type StudyKind = (typeof STUDY_KINDS)[number];

export type StudyStatus = 'queued' | 'preparing' | 'running' | 'reporting' | 'done' | 'failed';
export const ACTIVE_STUDY: readonly StudyStatus[] = ['queued', 'preparing', 'running', 'reporting'];

export const STAKEHOLDERS = ['customers', 'press', 'employees', 'investors', 'regulators', 'critics'] as const;
export type Stakeholder = (typeof STAKEHOLDERS)[number];

/** A named group of people, such as "IT buyers" or "Gen Z students". */
export interface Segment {
  name: string;
  about: string;
}

export interface FocusGroupInput {
  kind: 'focus_group';
  topic: string;
  /** What the group is shown: a post, a pitch, an ad script. */
  material: string;
  questions: string[];
  segments: Segment[];
  panelists: number;
}

export interface MessageTestInput {
  kind: 'message_test';
  goal: string | null;
  messages: { label: string; text: string }[];
  segments: Segment[];
  per_segment: number;
}

export interface CrisisInput {
  kind: 'crisis';
  situation: string;
  statement: string;
  stakeholders: Stakeholder[];
  rounds: 1 | 2;
}

export type StudyInput = FocusGroupInput | MessageTestInput | CrisisInput;

export interface PanelMember {
  id: number;
  name: string;
  segment: string;
  bio: string;
  stance: 'supportive' | 'neutral' | 'skeptical';
}

export type Sentiment = 'positive' | 'mixed' | 'negative';
export type SentimentShare = Record<Sentiment, number>;

export interface FocusGroupResult {
  panel: PanelMember[];
  transcript: { question: string; answers: { person: number; text: string; sentiment: Sentiment }[] }[];
  sentiment: { overall: SentimentShare; by_segment: (SentimentShare & { segment: string })[] };
  summary: {
    themes: { title: string; detail: string; people: number[] }[];
    agreement: string | null;
    disagreement: string | null;
    by_segment: { segment: string; takeaway: string }[];
    recommendations: string[];
  };
}

export interface MessageCell {
  message: number;
  /** 0 to 100 from appeal, clarity and credibility; null when nobody rated it. */
  score: number | null;
  act_share: number | null;
  quote: { person: number; text: string } | null;
}

export interface MessageTestResult {
  messages: { label: string; text: string; brand?: { rule: string; level: 'risk' | 'warn'; detail: string; excerpt: string | null }[] }[];
  panel: PanelMember[];
  ratings: { person: number; message: number; appeal: number; clarity: number; credibility: number; act: boolean; says: string }[];
  matrix: { segment: string; cells: MessageCell[]; winner: number | null }[];
  overall: { message: number; score: number | null; act_share: number | null }[];
  winner: number | null;
  /** True when groups picked different winners. */
  split: boolean;
}

export interface StatementCheck {
  id: string;
  level: 'good' | 'risk';
  title: string;
  detail: string;
  excerpt: string | null;
}

export interface CrisisResult {
  checks: StatementCheck[];
  reactions: { group: Stakeholder; name: string; heat: number; reaction: string; worst_line: string | null; question: string | null }[];
  spread: { spread: 'low' | 'medium' | 'high'; why: string; headlines: string[]; follow_ups: string[] } | null;
  advice: { changes: string[]; revised: string | null };
  risk: { level: 'low' | 'medium' | 'high'; heat: number };
}

interface ResultBase {
  engine: 'swarm' | 'swarm-offline';
  model: string | null;
  model_calls: number;
}

export type StudyResult =
  | (ResultBase & { kind: 'focus_group' } & FocusGroupResult)
  | (ResultBase & { kind: 'message_test' } & MessageTestResult)
  | (ResultBase & { kind: 'crisis' } & CrisisResult);

export interface Study {
  id: string;
  scope: string;
  kind: StudyKind;
  title: string;
  status: StudyStatus;
  progress: number;
  input: StudyInput;
  result: StudyResult | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface StudyStore {
  insert(row: Study): void;
  update(scope: string, id: string, patch: Partial<Pick<Study, 'status' | 'progress' | 'result' | 'error' | 'finished_at'>>): void;
  get(scope: string, id: string): Study | undefined;
  list(scope: string, opts?: { limit?: number; kind?: StudyKind }): Study[];
  countSince(scope: string, sinceIso: string): number;
  remove(scope: string, id: string): boolean;
  failStale(at: string): number;
}
