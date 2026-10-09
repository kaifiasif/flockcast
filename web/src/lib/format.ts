const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const formatDate = (iso: string | null | undefined) => (iso ? dateFormat.format(new Date(iso)) : '');

export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const seconds = (now - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return formatDate(iso);
}

export function formatClock(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '';
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export const formatBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export const formatPercent = (x: number | null | undefined) => (x === null || x === undefined ? 'n/a' : `${Math.round(x * 100)}%`);

/** "1 draft", "3 drafts". */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });
/** X counts every URL as 23 characters and emoji as 2. Mirrors the server's xLength. */
export function xLength(text: string): number {
  let n = 0;
  const rest = text.replace(/https?:\/\/[^\s]+/g, () => {
    n += 23;
    return '';
  });
  for (const { segment } of graphemes.segment(rest)) n += /\p{Extended_Pictographic}/u.test(segment) ? 2 : 1;
  return n;
}
export const X_LIMIT = 280;

/** A platform's action verb as a plural noun: "reply" to "Replies", "react" to "Reactions". */
const VERB_PLURALS: Record<string, string> = { reply: 'replies', react: 'reactions', comment: 'comments', upvote: 'upvotes', like: 'likes', repost: 'reposts', crosspost: 'crossposts', share: 'shares', quote: 'quotes' };
export function verbPlural(verb: string, capital = true): string {
  const word = VERB_PLURALS[verb] ?? `${verb}s`;
  return capital ? word[0].toUpperCase() + word.slice(1) : word;
}
