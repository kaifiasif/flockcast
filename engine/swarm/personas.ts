/**
 * The simulated audience. With a model, one call turns the audience notes and past posts into varied,
 * specific people. Offline, a fixed mix is built from the audience lines so demos and tests run free.
 */
import type { Llm } from '../llm.ts';
import type { Platform } from '../platforms.ts';
import type { Persona, Stance } from '../types.ts';

export const DEFAULT_AUDIENCE = [
  'Peers: people in the same field who reply with their own experience.',
  'Skeptics: followers who push back on claims that sound too neat or lack a source.',
  'Lurkers: people who like and repost but rarely reply.',
  'Newcomers: people seeing the author for the first time through a repost.',
].join('\n');

export const STANCES: readonly Stance[] = ['supportive', 'skeptical', 'neutral'];
const EXAMPLES_SHOWN = 15;

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
const str = (v: unknown, max: number, fallback = '') => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback);

/** Model output is untrusted: every field is checked, clipped and defaulted before it is used. */
export function validatePersonas(o: unknown, n: number): Persona[] {
  const list = (o as { personas?: unknown })?.personas;
  if (!Array.isArray(list) || list.length < 2) throw new Error('expected {personas: [..]} with at least 2 entries');
  return list.slice(0, n).map((raw, i) => {
    const p = (raw ?? {}) as Record<string, unknown>;
    const name = str(p.name, 40);
    if (!name || typeof p.bio !== 'string') throw new Error(`personas[${i}] needs name and bio`);
    return {
      id: i + 1, // 0 is the author
      name,
      segment: str(p.segment, 40, 'Follower'),
      bio: str(p.bio, 300),
      interests: Array.isArray(p.interests) ? p.interests.map((x) => String(x).slice(0, 40)).slice(0, 6) : [],
      stance: STANCES.includes(p.stance as Stance) ? (p.stance as Stance) : 'neutral',
      activity: clamp(Number(p.activity) || 0.5, 0.1, 1),
      follows_author: p.follows_author !== false && p.follows_creator !== false,
    };
  });
}

export async function generatePersonas(args: {
  llm: Llm | null;
  audience: string | null;
  examples: { text: string }[];
  handle: string;
  platform: Platform;
  count: number;
  rng: () => number;
}): Promise<Persona[]> {
  const { llm, audience, examples, handle, platform, count, rng } = args;
  if (!llm) return offlinePersonas({ audience, count, rng });
  const sample = examples.slice(0, EXAMPLES_SHOWN).map((a) => `- ${a.text.replace(/\s+/g, ' ').slice(0, 240)}`).join('\n') || '- (no past posts given)';
  return llm.json({
    system: 'You design realistic, varied social media users for an audience simulation. Reply with JSON only.',
    user: [
      `Create ${count} distinct people on ${platform.name} who could plausibly see posts by ${handle}.`,
      `How people behave on ${platform.name}: ${platform.culture}`,
      `Audience groups (spread the people across them):\n${(audience || DEFAULT_AUDIENCE).trim()}`,
      `What ${handle} has posted before:\n${sample}`,
      'Make them specific people with their own jobs, opinions and posting habits. Include a few who disagree easily, and a few who rarely post.',
      'JSON shape: {"personas":[{"name":"...","segment":"one of the groups","bio":"1-2 sentences","interests":["..."],"stance":"supportive|skeptical|neutral","activity":0.1-1.0,"follows_author":true|false}]}',
    ].join('\n\n'),
    validate: (o) => validatePersonas(o, count),
    temperature: 0.9,
  });
}

/** Keyword-matched archetypes for offline mode. Only stance and activity matter there. */
const ARCHETYPES: { re: RegExp; stance: Stance; activity: number; follows?: boolean }[] = [
  { re: /skeptic|critic|push ?back|doubt|cynic/i, stance: 'skeptical', activity: 0.7 },
  { re: /lurk|silent|quiet/i, stance: 'neutral', activity: 0.25 },
  { re: /new|first time|stranger/i, stance: 'neutral', activity: 0.45, follows: false },
  { re: /peer|fan|creator|builder|friend|customer|user/i, stance: 'supportive', activity: 0.65 },
];

export function offlinePersonas({ audience, count, rng }: { audience: string | null; count: number; rng: () => number }): Persona[] {
  const lines = (audience || DEFAULT_AUDIENCE).split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8);
  const out: Persona[] = [];
  for (let i = 0; i < count; i++) {
    const line = lines[i % lines.length];
    const segment = line.split(':')[0].replace(/^[-*\s]+/, '').slice(0, 40) || 'Follower';
    const a = ARCHETYPES.find((x) => x.re.test(line)) ?? { stance: 'neutral' as Stance, activity: 0.5 };
    out.push({
      id: i + 1,
      name: `${segment} ${Math.floor(i / lines.length) + 1}`,
      segment,
      bio: line.slice(0, 300),
      interests: [],
      stance: a.stance,
      activity: clamp(a.activity + (rng() - 0.5) * 0.2, 0.1, 1),
      follows_author: (a as { follows?: boolean }).follows !== false,
    });
  }
  return out;
}
