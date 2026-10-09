import { useSyncExternalStore } from 'react';

/** Hash routes keep the server's SPA fallback trivial and every screen deep-linkable. */
export type ProjectTab = 'rehearsals' | 'setup' | 'keys';
export type Route =
  | { name: 'landing' }
  | { name: 'login' }
  | { name: 'signup' }
  | { name: 'projects' }
  | { name: 'project'; id: string; tab: ProjectTab }
  | { name: 'compose'; id: string; from?: string }
  | { name: 'rehearsal'; id: string; rid: string }
  | { name: 'account' };

const ID = '([\\w-]+)';
const PATTERNS: [RegExp, (m: RegExpMatchArray) => Route][] = [
  [/^\/login$/, () => ({ name: 'login' })],
  [/^\/signup$/, () => ({ name: 'signup' })],
  [/^\/projects$/, () => ({ name: 'projects' })],
  [new RegExp(`^/projects/${ID}/new$`), (m) => ({ name: 'compose', id: m[1] })],
  [new RegExp(`^/projects/${ID}/new/${ID}$`), (m) => ({ name: 'compose', id: m[1], from: m[2] })],
  [new RegExp(`^/projects/${ID}/rehearsals/${ID}$`), (m) => ({ name: 'rehearsal', id: m[1], rid: m[2] })],
  [new RegExp(`^/projects/${ID}/(setup|keys)$`), (m) => ({ name: 'project', id: m[1], tab: m[2] as ProjectTab })],
  [new RegExp(`^/projects/${ID}$`), (m) => ({ name: 'project', id: m[1], tab: 'rehearsals' })],
  [/^\/account$/, () => ({ name: 'account' })],
];

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  for (const [pattern, build] of PATTERNS) {
    const match = path.match(pattern);
    if (match) return build(match);
  }
  return { name: 'landing' };
}

export function pathOf(route: Route): string {
  switch (route.name) {
    case 'landing':
      return '/';
    case 'project':
      return route.tab === 'rehearsals' ? `/projects/${route.id}` : `/projects/${route.id}/${route.tab}`;
    case 'compose':
      return route.from ? `/projects/${route.id}/new/${route.from}` : `/projects/${route.id}/new`;
    case 'rehearsal':
      return `/projects/${route.id}/rehearsals/${route.rid}`;
    default:
      return `/${route.name}`;
  }
}

export const hrefOf = (route: Route) => `#${pathOf(route)}`;
export const navigate = (route: Route, { replace = false } = {}) => {
  if (replace) history.replaceState(null, '', hrefOf(route));
  else location.hash = pathOf(route);
  if (replace) dispatchEvent(new HashChangeEvent('hashchange'));
};

const subscribe = (onChange: () => void) => {
  addEventListener('hashchange', onChange);
  return () => removeEventListener('hashchange', onChange);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => location.hash);
  return parseRoute(hash);
}
