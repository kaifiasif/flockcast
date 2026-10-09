/**
 * Which sources the launch advisor searches. The searching is done by the Python agents, each source
 * calling one fixed host, so no user input ever picks what the server fetches. Hacker News and Reddit
 * need no key; "web" uses Tavily's free tier; "sample" is canned findings for demos and tests.
 */
import { SEARCH_SOURCES, type SearchSource } from './types.ts';

export interface SearchEnv {
  /** Comma-separated: hackernews, reddit, web, sample. Default: hackernews,reddit, plus web when a Tavily key is set. */
  ADVISOR_SOURCES?: string;
  TAVILY_API_KEY?: string;
}

export function searchSourcesFromEnv(env: SearchEnv = process.env as SearchEnv): SearchSource[] {
  const wanted = (env.ADVISOR_SOURCES ?? `hackernews,reddit${env.TAVILY_API_KEY ? ',web' : ''}`).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const out: SearchSource[] = [];
  for (const name of new Set(wanted)) {
    if (!(SEARCH_SOURCES as readonly string[]).includes(name)) throw new Error(`Unknown advisor source "${name}". Use ${SEARCH_SOURCES.join(', ')}.`);
    if (name === 'web' && !env.TAVILY_API_KEY) throw new Error('ADVISOR_SOURCES includes "web", which needs TAVILY_API_KEY (free at tavily.com).');
    out.push(name as SearchSource);
  }
  return out;
}
