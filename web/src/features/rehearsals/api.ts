import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import { pollWhile, queryKeys } from '@/api/query-client';
import type { Rehearsal, RehearsalInput } from '@/api/types';

export const isActive = (r: Pick<Rehearsal, 'status'>) => ['queued', 'preparing', 'running', 'reporting'].includes(r.status);

export function useRehearsals(id: string) {
  return useQuery({
    queryKey: queryKeys.rehearsals(id),
    queryFn: async () => (await unwrap(api.projects[':id'].rehearsals.$get({ param: { id }, query: {} }))).rehearsals,
    refetchInterval: pollWhile<Rehearsal[]>((list) => list.some(isActive), 2000),
  });
}

export function useRehearsal(id: string, rid: string) {
  return useQuery({
    queryKey: queryKeys.rehearsal(id, rid),
    queryFn: async () => (await unwrap(api.projects[':id'].rehearsals[':rid'].$get({ param: { id, rid } }))).rehearsal,
    refetchInterval: pollWhile<Rehearsal>(isActive),
  });
}

export function useStartRehearsal(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (json: RehearsalInput) => (await unwrap(api.projects[':id'].rehearsals.$post({ param: { id }, json }))).rehearsal,
    onSuccess: (rehearsal) => {
      client.setQueryData(queryKeys.rehearsal(id, rehearsal.id), rehearsal);
      void client.invalidateQueries({ queryKey: queryKeys.rehearsals(id) });
      void client.invalidateQueries({ queryKey: queryKeys.projects, exact: true });
    },
  });
}

export function useDeleteRehearsal(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (rid: string) => unwrap(api.projects[':id'].rehearsals[':rid'].$delete({ param: { id, rid } })),
    onSuccess: (_, rid) => {
      client.removeQueries({ queryKey: queryKeys.rehearsal(id, rid) });
      void client.invalidateQueries({ queryKey: queryKeys.rehearsals(id) });
      void client.invalidateQueries({ queryKey: queryKeys.projects, exact: true });
    },
  });
}

export function useAskFollower(id: string, rid: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (json: { agent_id: number; prompt: string }) =>
      (await unwrap(api.projects[':id'].rehearsals[':rid'].interview.$post({ param: { id, rid }, json }))).interview,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.rehearsal(id, rid) }),
  });
}
