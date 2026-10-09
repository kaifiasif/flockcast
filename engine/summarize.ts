/**
 * Turns a simulated feed (posts plus the actions people took) into what a person reads: counts on the
 * post, the replies, and which sentences drew them. Pure; both engines produce this feed shape.
 */
import type { RehearsalReply, SentenceReaction } from './types.ts';

export interface FeedPost {
  post_id: number;
  user_id: number;
  original_post_id: number | null;
  content: string;
  quote_content?: string | null;
  num_likes?: number;
  num_shares?: number;
  num_dislikes?: number;
}

export interface FeedAction {
  round_num: number | null;
  agent_id: number;
  agent_name?: string;
  action_type: string;
  action_args: { post_id?: number; original_post_id?: number; content?: string; quote_content?: string };
}

const STOP = new Set(
  'a an the and or but if then so of to in on at for with by from as is are was were be been it its this that these those i you we they he she my your our their me us them not no do does did have has had just very really can will would should could about into than too also more most'.split(' '),
);

export function words(text: string | null | undefined): string[] {
  return String(text ?? '').toLowerCase().match(/[\p{L}\p{N}']+/gu)?.filter((w) => (w.length > 2 || /\d/.test(w)) && !STOP.has(w)) ?? [];
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return n / (A.size + B.size - n);
}

/** A lexical cue only, and labelled as such in the UI; the report carries the nuance. */
const PUSHBACK =
  /\b(disagree|wrong|not true|sources?|citation|evidence|doubt|overstat\w*|misleading|actually|nope|hard to believe|cherry.?pick\w*|oversimplif\w*|depends|says who|made up|not sure|study|proof)\b|\bwhere (is|are|does|did|do)\b[^.?!]*\bfrom\b|\?\s*$/i;
export const stanceOf = (text: string): 'pushback' | 'other' => (PUSHBACK.test(text) ? 'pushback' : 'other');

const MATCH = 0.5;

/** The simulated post that is the author's draft. External engines may paraphrase it; callers surface that. */
export function findDraftPost(posts: FeedPost[], draft: string): { post: FeedPost | null; similarity: number } {
  const target = words(draft);
  let best: FeedPost | null = null;
  let bestScore = 0;
  for (const p of posts) {
    if (p.original_post_id) continue;
    const s = jaccard(words(p.content), target);
    if (s > bestScore) {
      best = p;
      bestScore = s;
    }
  }
  return bestScore >= MATCH ? { post: best, similarity: bestScore } : { post: null, similarity: bestScore };
}

export function summarize({ draft, sentences, posts = [], actions = [], rounds = null }: {
  draft: string;
  sentences?: { id: string | null; text: string }[];
  posts?: FeedPost[];
  actions?: FeedAction[];
  rounds?: number | null;
}) {
  const { post: draftPost, similarity } = findDraftPost(posts, draft);
  const id = draftPost?.post_id;
  const onDraft = (a: FeedAction) => id != null && Number(a.action_args?.post_id ?? a.action_args?.original_post_id) === Number(id);

  const counts = { likes: 0, reposts: 0, quotes: 0, replies: 0, dislikes: 0 };
  const replies: RehearsalReply[] = [];
  for (const a of actions) {
    if (!onDraft(a)) continue;
    if (a.action_type === 'LIKE_POST') counts.likes++;
    else if (a.action_type === 'DISLIKE_POST') counts.dislikes++;
    else if (a.action_type === 'REPOST') counts.reposts++;
    else if (a.action_type === 'QUOTE_POST' || a.action_type === 'REPLY') {
      const kind = a.action_type === 'REPLY' ? 'reply' : 'quote';
      counts[kind === 'reply' ? 'replies' : 'quotes']++;
      const text = a.action_args?.quote_content || a.action_args?.content || '';
      if (text) replies.push({ agent_id: a.agent_id, agent_name: a.agent_name || `person ${a.agent_id}`, round: a.round_num, kind, text, stance: stanceOf(text) });
    }
  }
  if (draftPost) {
    counts.likes = Math.max(counts.likes, draftPost.num_likes ?? 0);
    counts.reposts = Math.max(counts.reposts, draftPost.num_shares ?? 0);
    counts.dislikes = Math.max(counts.dislikes, draftPost.num_dislikes ?? 0);
  }

  // conversation the draft sparked elsewhere in the feed: on-topic posts by others
  const draftWords = words(draft);
  const related = posts
    .filter((p) => p !== draftPost && !p.original_post_id && jaccard(words(p.content), draftWords) >= 0.12)
    .map((p) => ({ agent_id: p.user_id, text: p.content, stance: stanceOf(p.content) }))
    .slice(0, 20);

  // which sentences the reactions are about: content-word overlap, best match wins
  const reactions = [...replies, ...related];
  const perSentence: SentenceReaction[] = (sentences?.length ? sentences : [{ id: null, text: draft }]).map((s) => ({ id: s.id ?? null, text: s.text, mentions: 0, pushback: 0, examples: [] }));
  for (const r of reactions) {
    const rw = words(r.text);
    let best: SentenceReaction | null = null;
    let bestScore = 0;
    const numbers = rw.filter((w) => /\d/.test(w));
    for (const s of perSentence) {
      const sw = words(s.text);
      // a reply that repeats a sentence's number ("where is the 40% from?") is about that sentence
      const sc = jaccard(rw, sw) + (numbers.some((n) => sw.includes(n)) ? 0.3 : 0);
      if (sc > bestScore) {
        best = s;
        bestScore = sc;
      }
    }
    if (!best || bestScore < 0.08) continue;
    best.mentions++;
    if (r.stance === 'pushback') best.pushback++;
    if (best.examples.length < 3) best.examples.push(r.text);
  }

  return {
    draft_seeded: Boolean(draftPost),
    draft_match: Number(similarity.toFixed(2)),
    agents: new Set(actions.map((a) => a.agent_id)).size,
    rounds,
    total_actions: actions.length,
    counts,
    replies,
    related,
    sentences: perSentence,
    pushback_share: reactions.length ? Number((reactions.filter((r) => r.stance === 'pushback').length / reactions.length).toFixed(2)) : 0,
  };
}

/** Splits text into sentences on ., ! or ? followed by space. Good enough for reaction matching. */
export const sentencesOf = (text: string): string[] => String(text).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
