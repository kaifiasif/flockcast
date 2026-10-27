import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import { pollWhile, queryKeys } from '@/api/query-client';
import type { BrandRules, Study, StudyInput, StudySummary } from '@/api/types';

export const isWorking = (s: Pick<Study, 'status'>) => ['queued', 'preparing', 'running', 'reporting'].includes(s.status);

export function useStudies(id: string) {
  return useQuery({
    queryKey: queryKeys.studies(id),
    queryFn: async () => (await unwrap(api.projects[':id'].studies.$get({ param: { id }, query: {} }))).studies,
    refetchInterval: pollWhile<StudySummary[]>((list) => list.some(isWorking), 2000),
  });
}

export function useStudy(id: string, sid: string) {
  return useQuery({
    queryKey: queryKeys.study(id, sid),
    queryFn: async () => (await unwrap(api.projects[':id'].studies[':sid'].$get({ param: { id, sid } }))).study,
    refetchInterval: pollWhile<Study>(isWorking),
  });
}

export function useStartStudy(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (json: StudyInput) => (await unwrap(api.projects[':id'].studies.$post({ param: { id }, json }))).study,
    onSuccess: (study) => {
      client.setQueryData(queryKeys.study(id, study.id), study);
      void client.invalidateQueries({ queryKey: queryKeys.studies(id), exact: true });
    },
  });
}

export function useDeleteStudy(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sid: string) => unwrap(api.projects[':id'].studies[':sid'].$delete({ param: { id, sid } })),
    onSuccess: (_, sid) => {
      client.removeQueries({ queryKey: queryKeys.study(id, sid) });
      void client.invalidateQueries({ queryKey: queryKeys.studies(id), exact: true });
    },
  });
}

export function useSaveBrand(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (json: Partial<BrandRules>) => (await unwrap(api.projects[':id'].brand.$put({ param: { id }, json }))).brand,
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.project(id), exact: true }),
  });
}
