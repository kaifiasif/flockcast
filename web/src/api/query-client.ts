import { QueryClient } from '@tanstack/react-query';
import { isApiError } from './errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: true,
      // a 4xx will not fix itself on retry; a network blip might
      retry: (count, error) => count < 2 && !(isApiError(error) && error.status >= 400 && error.status < 500),
    },
  },
});

/** Every cache key in one place, so invalidation after a mutation is never a guess. */
export const queryKeys = {
  session: ['session'] as const,
  config: ['config'] as const,
  projects: ['projects'] as const,
  project: (id: string) => ['projects', id] as const,
  keys: (id: string) => ['projects', id, 'keys'] as const,
  rehearsals: (id: string) => ['projects', id, 'rehearsals'] as const,
  rehearsal: (id: string, rid: string) => ['projects', id, 'rehearsals', rid] as const,
  advice: (id: string) => ['projects', id, 'advice'] as const,
  adviceOne: (id: string, aid: string) => ['projects', id, 'advice', aid] as const,
};

/** Polls every `ms` while `isBusy(data)` says background work is still running. */
export const pollWhile =
  <T,>(isBusy: (data: T) => boolean, ms = 1200) =>
  (query: { state: { data: T | undefined } }) =>
    query.state.data !== undefined && isBusy(query.state.data) ? ms : false;
