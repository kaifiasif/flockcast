import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import { pollWhile, queryKeys } from '@/api/query-client';
import type { CompareInput, OutcomeInput, Rehearsal } from '@/api/types';
import { isActive } from '@/features/rehearsals/api';

export function useStartComparison(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (json: CompareInput) => unwrap(api.projects[':id'].comparisons.$post({ param: { id }, json })),
    onSuccess: (res) => {
      client.setQueryData(queryKeys.comparison(id, res.group_id), res.rehearsals);
      void client.invalidateQueries({ queryKey: queryKeys.rehearsals(id) });
    },
  });
}

export function useComparison(id: string, gid: string) {
  return useQuery({
    queryKey: queryKeys.comparison(id, gid),
    queryFn: async () => (await unwrap(api.projects[':id'].comparisons[':gid'].$get({ param: { id, gid } }))).rehearsals,
    refetchInterval: pollWhile<Rehearsal[]>((list) => list.some(isActive), 2000),
  });
}

export function useRecordOutcome(id: string, rid: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (json: OutcomeInput) => (await unwrap(api.projects[':id'].rehearsals[':rid'].outcome.$put({ param: { id, rid }, json }))).rehearsal,
    onSuccess: (rehearsal) => {
      client.setQueryData(queryKeys.rehearsal(id, rid), rehearsal);
      void client.invalidateQueries({ queryKey: queryKeys.calibration(id) });
    },
  });
}

export function useClearOutcome(id: string, rid: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.projects[':id'].rehearsals[':rid'].outcome.$delete({ param: { id, rid } })),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.rehearsal(id, rid) });
      void client.invalidateQueries({ queryKey: queryKeys.calibration(id) });
    },
  });
}

export function useCalibration(id: string) {
  return useQuery({
    queryKey: queryKeys.calibration(id),
    queryFn: async () => (await unwrap(api.projects[':id'].calibration.$get({ param: { id } }))).calibration,
  });
}
