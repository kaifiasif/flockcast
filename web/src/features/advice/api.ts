import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import { pollWhile, queryKeys } from '@/api/query-client';
import type { Advice, AdviceInput } from '@/api/types';

export const isWorking = (a: Pick<Advice, 'status'>) => ['queued', 'researching', 'simulating', 'deciding'].includes(a.status);

export function useAdviceList(id: string) {
  return useQuery({
    queryKey: queryKeys.advice(id),
    queryFn: async () => (await unwrap(api.projects[':id'].advice.$get({ param: { id }, query: {} }))).advice,
    refetchInterval: pollWhile<Advice[]>((list) => list.some(isWorking), 2000),
  });
}

export function useAdvice(id: string, aid: string) {
  return useQuery({
    queryKey: queryKeys.adviceOne(id, aid),
    queryFn: async () => (await unwrap(api.projects[':id'].advice[':aid'].$get({ param: { id, aid } }))).advice,
    refetchInterval: pollWhile<Advice>(isWorking),
  });
}

export function useStartAdvice(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (json: AdviceInput) => (await unwrap(api.projects[':id'].advice.$post({ param: { id }, json }))).advice,
    onSuccess: (advice) => {
      client.setQueryData(queryKeys.adviceOne(id, advice.id), advice);
      void client.invalidateQueries({ queryKey: queryKeys.advice(id), exact: true });
    },
  });
}

export function useDeleteAdvice(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (aid: string) => unwrap(api.projects[':id'].advice[':aid'].$delete({ param: { id, aid } })),
    onSuccess: (_, aid) => {
      client.removeQueries({ queryKey: queryKeys.adviceOne(id, aid) });
      void client.invalidateQueries({ queryKey: queryKeys.advice(id), exact: true });
    },
  });
}
