/**
 * Free web research. Hacker News (Algolia) and Reddit need no key; Tavily is optional and has a free
 * tier. Each adapter calls one fixed host, so no user input ever picks what the server fetches.
 */
import { sampleSearch } from './sample.ts';
import type { Finding, SearchAdapter } from './types.ts';

type Fetch = typeof fetch;
type Found = Omit<Finding, 'id'>;

const MAX_BODY = 2_000_000;
const TEXT = 600;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#x27': "'", '#39': "'", '#x2F': '/' };
/** Search APIs return snippets of HTML; findings are plain text. */
export function plainText(html: string): string {
  return html
    .replace(/<(br|p|\/p|li)[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => ENTITIES[e] ?? (e.startsWith('#x') ? String.fromCodePoint(parseInt(e.slice(2), 16)) : e.startsWith('#') ? String.fromCodePoint(Number(e.slice(1))) : m))
    .replace(/\s+/g, ' ')
    .trim();
}

async function getJson(fetchImpl: Fetch, url: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const res = await fetchImpl(url, { ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_BODY) throw new Error('response too large');
  return JSON.parse(text);
}

const isoOrNull = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

export interface AdapterOptions {
  fetchImpl?: Fetch;
  timeoutMs?: number;
  userAgent?: string;
}

/** Stories and comments on Hacker News, through the public Algolia API. */
export function hackerNews({ fetchImpl = globalThis.fetch, timeoutMs = 10_000, userAgent = 'flockcast/1.0' }: AdapterOptions = {}): SearchAdapter {
  return {
    name: 'hackernews',
    async search(query, { limit, signal }) {
      const url = `https://hn.algolia.com/api/v1/search?${new URLSearchParams({ query, tags: '(story,comment)', hitsPerPage: String(Math.min(limit, 50)) })}`;
      const body = (await getJson(fetchImpl, url, { headers: { accept: 'application/json', 'user-agent': userAgent } }, timeoutMs, signal)) as { hits?: Record<string, unknown>[] };
      return (body.hits ?? []).flatMap((h): Found[] => {
        const text = plainText(String(h.comment_text ?? h.story_text ?? ''));
        const title = plainText(String(h.title ?? h.story_title ?? ''));
        if (!text && !title) return [];
        return [{ source: 'Hacker News', title: title.slice(0, 200), text: (text || title).slice(0, TEXT), url: `https://news.ycombinator.com/item?id=${encodeURIComponent(String(h.objectID))}`, date: isoOrNull(h.created_at), score: typeof h.points === 'number' ? h.points : null }];
      });
    },
  };
}

/** Posts across Reddit, through its public JSON search. Some hosts block it; the advisor carries on without. */
export function reddit({ fetchImpl = globalThis.fetch, timeoutMs = 10_000, userAgent = 'flockcast/1.0 (launch research)' }: AdapterOptions = {}): SearchAdapter {
  return {
    name: 'reddit',
    async search(query, { limit, signal }) {
      const url = `https://www.reddit.com/search.json?${new URLSearchParams({ q: query, limit: String(Math.min(limit, 50)), sort: 'relevance', t: 'year', raw_json: '1' })}`;
      const body = (await getJson(fetchImpl, url, { headers: { accept: 'application/json', 'user-agent': userAgent } }, timeoutMs, signal)) as { data?: { children?: { data?: Record<string, unknown> }[] } };
      return (body.data?.children ?? []).flatMap(({ data: d }): Found[] => {
        if (!d || typeof d.permalink !== 'string' || !d.permalink.startsWith('/r/')) return [];
        const title = plainText(String(d.title ?? ''));
        const text = plainText(String(d.selftext ?? ''));
        return [{ source: `Reddit r/${String(d.subreddit ?? '').slice(0, 40)}`, title: title.slice(0, 200), text: (text || title).slice(0, TEXT), url: `https://www.reddit.com${d.permalink}`, date: typeof d.created_utc === 'number' ? new Date(d.created_utc * 1000).toISOString() : null, score: typeof d.score === 'number' ? d.score : null }];
      });
    },
  };
}

/** The open web through Tavily (free tier, needs TAVILY_API_KEY). */
export function tavily({ apiKey, fetchImpl = globalThis.fetch, timeoutMs = 15_000, userAgent = 'flockcast/1.0' }: AdapterOptions & { apiKey: string }): SearchAdapter {
  return {
    name: 'web',
    async search(query, { limit, signal }) {
      const body = (await getJson(
        fetchImpl,
        'https://api.tavily.com/search',
        { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}`, 'user-agent': userAgent }, body: JSON.stringify({ query, max_results: Math.min(limit, 20), search_depth: 'basic' }) },
        timeoutMs,
        signal,
      )) as { results?: Record<string, unknown>[] };
      return (body.results ?? []).flatMap((r): Found[] => {
        const url = String(r.url ?? '');
        if (!/^https?:\/\//.test(url)) return [];
        let host = 'Web';
        try {
          host = new URL(url).hostname.replace(/^www\./, '');
        } catch {
          return [];
        }
        return [{ source: host, title: plainText(String(r.title ?? '')).slice(0, 200), text: plainText(String(r.content ?? '')).slice(0, TEXT), url, date: isoOrNull(r.published_date), score: null }];
      });
    },
  };
}

export const SEARCH_SOURCES = ['hackernews', 'reddit', 'web', 'sample'] as const;

export interface SearchEnv {
  /** Comma-separated: hackernews, reddit, web, sample (canned findings for demos). Default: hackernews,reddit, plus web when a Tavily key is set. */
  ADVISOR_SOURCES?: string;
  TAVILY_API_KEY?: string;
}

export function searchFromEnv(env: SearchEnv = process.env as SearchEnv, opts: AdapterOptions = {}): SearchAdapter[] {
  const wanted = (env.ADVISOR_SOURCES ?? `hackernews,reddit${env.TAVILY_API_KEY ? ',web' : ''}`).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const out: SearchAdapter[] = [];
  for (const name of new Set(wanted)) {
    if (name === 'hackernews') out.push(hackerNews(opts));
    else if (name === 'reddit') out.push(reddit(opts));
    else if (name === 'web') {
      if (!env.TAVILY_API_KEY) throw new Error('ADVISOR_SOURCES includes "web", which needs TAVILY_API_KEY (free at tavily.com).');
      out.push(tavily({ ...opts, apiKey: env.TAVILY_API_KEY }));
    } else if (name === 'sample') out.push(sampleSearch());
    else throw new Error(`Unknown advisor source "${name}". Use ${SEARCH_SOURCES.join(', ')}.`);
  }
  return out;
}
