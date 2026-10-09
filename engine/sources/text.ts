/**
 * The default source: the text arrives with the request. `subject` names what the text belongs to in
 * the caller's world (a draft id, a URL); without one, the text itself is the subject, so rehearsing
 * the same words twice continues one history.
 */
import { createHash } from 'node:crypto';
import { RehearsalError } from '../core.ts';
import { sentencesOf } from '../summarize.ts';
import type { Source } from '../types.ts';

export interface TextRef {
  /** One post. Separate thread parts with a line holding only "---". */
  text?: string;
  /** Or the thread parts directly. */
  posts?: string[];
  subject?: string;
  title?: string;
  /** Past posts by the same author, to model followers on. */
  examples?: { text: string; published_at?: string | null }[];
}

const SPLIT = /\n\s*---\s*\n/;
const TITLE_CHARS = 80;

/** The first sentence when it is short enough, otherwise the opening cut on a word with an ellipsis. */
function titleFrom(post: string): string {
  const flat = post.replace(/\s+/g, ' ').trim();
  const first = sentencesOf(flat)[0] ?? flat;
  if (first.length <= TITLE_CHARS) return first;
  return `${flat.slice(0, TITLE_CHARS).replace(/\s+\S*$/, '').replace(/[\s,;:.-]+$/, '')}…`;
}
const MAX_EXAMPLES = 25;

export function textSource({ examplesFor }: { examplesFor?: (scope: string) => { text: string; published_at?: string | null }[] } = {}): Source {
  return {
    name: 'text',
    load(scope, ref) {
      const r = (ref ?? {}) as TextRef;
      const posts = (Array.isArray(r.posts) ? r.posts.map(String) : String(r.text ?? '').split(SPLIT)).map((p) => p.trim()).filter(Boolean);
      if (!posts.length) throw new RehearsalError(400, 'INVALID', 'Paste the text you want to rehearse.');
      const joined = posts.join('\n\n');
      const subject = r.subject?.trim() ? `ref:${r.subject.trim().slice(0, 200)}` : `text:${createHash('sha256').update(joined).digest('hex').slice(0, 32)}`;
      const title = r.title?.trim().slice(0, 120) || titleFrom(posts[0]);
      const examples = [...(r.examples ?? []), ...(examplesFor?.(scope) ?? [])]
        .filter((e) => typeof e?.text === 'string' && e.text.trim())
        .slice(0, MAX_EXAMPLES)
        .map((e) => ({ text: e.text.slice(0, 1000), published_at: e.published_at ?? null }));
      return {
        subject,
        title,
        input: { posts, sentences: posts.flatMap(sentencesOf).map((text) => ({ id: null, text })), examples },
      };
    },
  };
}
