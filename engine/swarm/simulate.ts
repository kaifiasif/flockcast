/**
 * A small social-feed simulation. The author (agent 0) posts the draft word for word in round 0; in each
 * later round a random subset of people scrolls a ranked feed and acts. With a model, everyone active in
 * a round is decided in ONE call (about rounds + 2 calls per rehearsal, which fits free tiers). Offline,
 * a rule policy stands in and the result is labelled as an estimate.
 *
 * Posts and actions use the same shapes as the MiroFish engine, so summarize() reads both.
 */
import type { Llm } from '../llm.ts';
import type { Platform } from '../platforms.ts';
import type { FeedAction, FeedPost } from '../summarize.ts';
import { sentencesOf, words } from '../summarize.ts';
import type { Persona } from '../types.ts';

const MAX_ACTIVE = 8;
const FEED_SIZE = 4;
const MAX_ACTIONS_PER_ROUND = 2;
const ACTION_TYPES: Record<string, string> = { like: 'LIKE_POST', repost: 'REPOST', reply: 'REPLY', quote: 'QUOTE_POST', post: 'CREATE_POST', nothing: 'DO_NOTHING' };

/** Seeded PRNG (FNV-1a seed, mulberry32 steps): the same draft and audience give the same run. */
export function rngFrom(seedText: string): () => number {
  let h = 2166136261;
  for (const c of String(seedText)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Post extends FeedPost {
  kind: 'post' | 'reply' | 'quote';
  round: number;
  num_likes: number;
  num_shares: number;
  num_dislikes: number;
  num_replies: number;
  num_quotes: number;
}
interface Author extends Omit<Persona, 'follows_author'> {
  follows_author: boolean;
}

export interface World {
  agents: Author[];
  posts: Post[];
  actions: FeedAction[];
  /** agent id -> their last few actions, in words; used for the next round and for interviews */
  memory: Map<number, string[]>;
  /** `${agent}:${type}:${post}` already done, so nobody likes the same post twice */
  acted: Set<string>;
  round: number;
  draft: string;
  platform: Platform;
}

export interface Decision {
  agent_id: number;
  action: string;
  post_id?: number | null;
  text?: string;
}

export function createWorld({ handle, draft, personas, platform }: { handle: string; draft: string; personas: Persona[]; platform: Platform }): World {
  const author: Author = { id: 0, name: handle, segment: 'author', bio: 'The author. Posted the draft.', interests: [], stance: 'supportive', activity: 0, follows_author: true };
  return { agents: [author, ...personas], posts: [], actions: [], memory: new Map(), acted: new Set(), round: 0, draft, platform };
}

function addPost(world: World, p: { user_id: number; content: string; original_post_id?: number | null; kind?: Post['kind'] }): Post {
  const post: Post = {
    post_id: world.posts.length + 1,
    user_id: p.user_id,
    original_post_id: p.original_post_id ?? null,
    kind: p.kind ?? 'post',
    content: p.content,
    quote_content: null,
    round: world.round,
    num_likes: 0,
    num_shares: 0,
    num_dislikes: 0,
    num_replies: 0,
    num_quotes: 0,
  };
  if (post.kind === 'quote') {
    post.quote_content = p.content;
    post.content = '';
  }
  world.posts.push(post);
  return post;
}

function record(world: World, agent: Author, type: string, args: FeedAction['action_args'], note: string): void {
  world.actions.push({ round_num: world.round, agent_id: agent.id, agent_name: agent.name, action_type: type, action_args: args });
  const log = world.memory.get(agent.id) ?? [];
  log.push(`round ${world.round}: ${note}`);
  world.memory.set(agent.id, log.slice(-4));
}

export function seedDraft(world: World): Post {
  const p = addPost(world, { user_id: 0, content: world.draft });
  record(world, world.agents[0], 'CREATE_POST', { post_id: p.post_id, content: p.content }, 'posted the draft');
  return p;
}

/** Followers see the author; everyone else sees the draft only once it is reposted or argued about. */
export function feedFor(world: World, agent: Author): Post[] {
  const interests = words([agent.bio, ...(agent.interests ?? [])].join(' '));
  const overlap = (a: string[]) => a.filter((w) => interests.includes(w)).length;
  return world.posts
    .filter((p) => p.user_id !== agent.id)
    .filter((p) => p.user_id !== 0 || agent.follows_author || p.num_shares + p.num_quotes > 0 || p.num_replies > 1)
    .map((p) => {
      const engagement = Math.log1p(p.num_likes + 2 * (p.num_shares + p.num_quotes) + 1.5 * p.num_replies);
      const fresh = -0.35 * (world.round - p.round);
      const fromAuthor = p.user_id === 0 && agent.follows_author ? 1.5 : 0;
      return { p, score: engagement + fresh + fromAuthor + 0.3 * overlap(words(p.content || p.quote_content)) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, FEED_SIZE)
    .map((x) => x.p);
}

/** Applies one decision if it is valid for what this person can see; model output is never trusted as-is. */
export function apply(world: World, agent: Author, decision: Decision, visible: Post[]): boolean {
  const type = ACTION_TYPES[String(decision.action || '').toLowerCase()];
  if (!type || type === 'DO_NOTHING') return false;
  const target = decision.post_id == null ? null : visible.find((p) => p.post_id === Number(decision.post_id)) ?? null;
  const text = String(decision.text || '').replace(/\s+/g, ' ').trim().slice(0, world.platform.replyChars);
  if (type !== 'CREATE_POST' && !target) return false;
  if (['REPLY', 'QUOTE_POST', 'CREATE_POST'].includes(type) && !text) return false;
  const key = `${agent.id}:${type}:${target?.post_id ?? text}`;
  if (world.acted.has(key)) return false;
  world.acted.add(key);

  const v = world.platform.verbs;
  if (type === 'LIKE_POST' && target) {
    target.num_likes++;
    record(world, agent, type, { post_id: target.post_id }, `${v.like}d post ${target.post_id}`);
  } else if (type === 'REPOST' && target) {
    target.num_shares++;
    record(world, agent, type, { post_id: target.post_id }, `${v.repost}ed post ${target.post_id}`);
  } else if ((type === 'REPLY' || type === 'QUOTE_POST') && target) {
    const reply = type === 'REPLY';
    addPost(world, { user_id: agent.id, content: text, original_post_id: target.post_id, kind: reply ? 'reply' : 'quote' });
    if (reply) target.num_replies++;
    else target.num_quotes++;
    const args = reply ? { post_id: target.post_id, content: text } : { post_id: target.post_id, quote_content: text };
    record(world, agent, type, args, `${reply ? `wrote a ${v.reply} on` : `${v.quote}d`} post ${target.post_id}: "${text.slice(0, 80)}"`);
  } else {
    const p = addPost(world, { user_id: agent.id, content: text });
    record(world, agent, type, { post_id: p.post_id, content: text }, `posted: "${text.slice(0, 80)}"`);
  }
  return true;
}

const authorOf = (world: World, p: Post) => (p.user_id === 0 ? `@${world.agents[0].name}` : world.agents[p.user_id]?.name ?? `person ${p.user_id}`);
const show = (world: World, p: Post) =>
  `[post ${p.post_id}] ${authorOf(world, p)}${p.original_post_id ? ` (${p.kind} to post ${p.original_post_id})` : ''} · ${p.num_likes} likes, ${p.num_shares} reposts, ${p.num_replies} replies\n${p.content || p.quote_content}`;

export async function llmRound(llm: Llm, world: World, active: { agent: Author; visible: Post[] }[]): Promise<Decision[]> {
  const { platform } = world;
  const blocks = active.map(({ agent, visible }) =>
    [
      `## Person #${agent.id}: ${agent.name} (${agent.segment}, ${agent.stance})`,
      agent.bio + (agent.interests?.length ? ` Interests: ${agent.interests.join(', ')}.` : ''),
      `Their recent activity: ${(world.memory.get(agent.id) ?? ['nothing yet']).join('; ')}`,
      'Their feed right now:',
      ...visible.map((p) => show(world, p)),
    ].join('\n'),
  );
  const ids = new Set(active.map((a) => a.agent.id));
  const v = platform.verbs;
  return llm.json({
    system: [
      `You simulate how specific people behave on ${platform.name} during one hour. ${platform.culture} Stay in each person's character and voice.`,
      `Most people mostly scroll: "nothing" and "like" (${v.like}) are the most common actions. ${v.reply[0].toUpperCase() + v.reply.slice(1)}s are short and specific to the post.`,
      'Skeptical people question claims that sound unsupported; supportive people add their own experience. Never invent facts about the author.',
      'Reply with JSON only.',
    ].join(' '),
    user: [
      `Round ${world.round}. For each person below, decide 0 to 2 actions on posts in THEIR feed.`,
      `Actions: like (${v.like}), repost (${v.repost}), reply (${v.reply}), quote (${v.quote}), post (a new post of their own), nothing.`,
      ...blocks,
      `JSON shape: {"actions":[{"agent_id":1,"action":"like|repost|reply|quote|post|nothing","post_id":12,"text":"only for reply, quote, post (max ${platform.replyChars} chars)"}]}`,
    ].join('\n\n'),
    validate: (o) => {
      const list = (o as { actions?: unknown })?.actions;
      if (!Array.isArray(list)) throw new Error('expected {actions: [..]}');
      return (list as Decision[]).filter((a) => a && ids.has(Number(a.agent_id)));
    },
  });
}

const CLAIMY = /\d|%|\b(percent|half|twice|double|triple|ten|twenty|thirty|forty|fifty|hundred|thousand|million|billion|always|never|every|nobody|everyone|all|most|proven|fact|guaranteed|best|only)\b/i;
/** Shortens on a word boundary so quoted snippets never end mid-word. */
const clip = (t: string, n: number) => (t.length <= n ? t : `${t.slice(0, n).replace(/\s+\S*$/, '')}…`);

const SKEPTIC_LINES = [
  (c: string) => `Where does "${c}" come from? Is there a source?`,
  (c: string) => `"${c}" sounds too neat. What's the evidence?`,
  (c: string) => `Not sure I buy "${c}". Says who?`,
];

/** Offline rule policy. Deterministic given the rng; few, plain-worded reactions. */
export function offlineRound(world: World, active: { agent: Author; visible: Post[] }[], rng: () => number): Decision[] {
  const out: Decision[] = [];
  for (const { agent, visible } of active) {
    const p = visible.find((x) => !world.acted.has(`${agent.id}:LIKE_POST:${x.post_id}`) && !world.acted.has(`${agent.id}:REPLY:${x.post_id}`));
    if (!p) continue;
    const text = p.content || p.quote_content || '';
    // each skeptic picks one claim, so several skeptics don't all ask about the same sentence
    const claims = sentencesOf(text).filter((s) => CLAIMY.test(s));
    const r = rng();
    const claim = claims[Math.floor(r * claims.length)];
    if (agent.stance === 'skeptical' && claim && p.user_id === 0) {
      out.push({ agent_id: agent.id, action: 'reply', post_id: p.post_id, text: SKEPTIC_LINES[agent.id % SKEPTIC_LINES.length](clip(claim, 70)) });
    } else if (agent.stance === 'skeptical') out.push({ agent_id: agent.id, action: r < 0.25 ? 'like' : 'nothing', post_id: p.post_id });
    else if (agent.stance === 'supportive') {
      if (r < 0.15) out.push({ agent_id: agent.id, action: 'reply', post_id: p.post_id, text: `Agree with "${clip(sentencesOf(text)[0] ?? '', 100)}" Matches what I've seen.` });
      else out.push({ agent_id: agent.id, action: r < 0.4 ? 'repost' : 'like', post_id: p.post_id });
    } else out.push({ agent_id: agent.id, action: r < 0.35 ? 'like' : r < 0.43 ? 'repost' : 'nothing', post_id: p.post_id });
  }
  return out;
}

export async function simulate({ llm, world, rounds, rng, onRound }: { llm: Llm | null; world: World; rounds: number; rng: () => number; onRound?: (r: number, n: number) => void }): Promise<number> {
  seedDraft(world);
  for (let r = 1; r <= rounds; r++) {
    world.round = r;
    const active = world.agents
      .filter((a) => a.id !== 0 && rng() < a.activity)
      .slice(0, MAX_ACTIVE)
      .map((agent) => ({ agent, visible: feedFor(world, agent) }))
      .filter((a) => a.visible.length);
    if (active.length) {
      const decisions = llm ? await llmRound(llm, world, active) : offlineRound(world, active, rng);
      const perAgent = new Map<number, number>();
      for (const d of decisions) {
        const a = active.find((x) => x.agent.id === Number(d.agent_id));
        if (!a || (perAgent.get(a.agent.id) ?? 0) >= MAX_ACTIONS_PER_ROUND) continue;
        if (apply(world, a.agent, d, a.visible)) perAgent.set(a.agent.id, (perAgent.get(a.agent.id) ?? 0) + 1);
      }
    }
    onRound?.(r, rounds);
  }
  return rounds;
}
