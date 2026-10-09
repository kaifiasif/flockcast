import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import { queryKeys } from '@/api/query-client';
import type { ProjectInput } from '@/api/types';

/** Engine, model, platforms and limits for this server. Never includes a key. */
export function useAppConfig() {
  return useQuery({ queryKey: queryKeys.config, queryFn: () => unwrap(api.config.$get()), staleTime: 5 * 60_000 });
}

export function useProjects() {
  return useQuery({ queryKey: queryKeys.projects, queryFn: async () => (await unwrap(api.projects.$get())).projects });
}

export function useProject(id: string) {
  return useQuery({ queryKey: queryKeys.project(id), queryFn: async () => (await unwrap(api.projects[':id'].$get({ param: { id } }))).project });
}

export function useCreateProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (json: ProjectInput) => (await unwrap(api.projects.$post({ json }))).project,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.projects }),
  });
}

export function useUpdateProject(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (json: ProjectInput) => (await unwrap(api.projects[':id'].$put({ param: { id }, json }))).project,
    onSuccess: (project) => {
      client.setQueryData(queryKeys.project(id), project);
      void client.invalidateQueries({ queryKey: queryKeys.projects, exact: true });
    },
  });
}

export function useDeleteProject(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.projects[':id'].$delete({ param: { id } })),
    onSuccess: () => {
      client.removeQueries({ queryKey: queryKeys.project(id) });
      void client.invalidateQueries({ queryKey: queryKeys.projects, exact: true });
    },
  });
}

export function useApiKeys(id: string) {
  return useQuery({ queryKey: queryKeys.keys(id), queryFn: async () => (await unwrap(api.projects[':id'].keys.$get({ param: { id } }))).keys });
}

export function useCreateKey(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => unwrap(api.projects[':id'].keys.$post({ param: { id }, json: { name } })),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.keys(id) }),
  });
}

export function useRevokeKey(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (kid: string) => unwrap(api.projects[':id'].keys[':kid'].$delete({ param: { id, kid } })),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.keys(id) }),
  });
}
