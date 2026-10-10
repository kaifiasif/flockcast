import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import { queryKeys } from '@/api/query-client';

type MemberRole = 'editor' | 'reviewer' | 'viewer';

export function useMembers(id: string) {
  return useQuery({ queryKey: queryKeys.members(id), queryFn: () => unwrap(api.projects[':id'].members.$get({ param: { id } })) });
}

export function useCreateInvite(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (role: MemberRole) => unwrap(api.projects[':id'].invites.$post({ param: { id }, json: { role } })),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.members(id) }),
  });
}

export function useRevokeInvite(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (iid: string) => unwrap(api.projects[':id'].invites[':iid'].$delete({ param: { id, iid } })),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.members(id) }),
  });
}

export function useSetRole(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ uid, role }: { uid: string; role: MemberRole }) => unwrap(api.projects[':id'].members[':uid'].$put({ param: { id, uid }, json: { role } })),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.members(id) }),
  });
}

export function useRemoveMember(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (uid: string) => unwrap(api.projects[':id'].members[':uid'].$delete({ param: { id, uid } })),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.members(id) });
      void client.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useAcceptInvite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => (await unwrap(api.invites.accept.$post({ json: { token } }))).project,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.projects }),
  });
}

export function useApproval(id: string, rid: string) {
  return useQuery({ queryKey: queryKeys.approval(id, rid), queryFn: async () => (await unwrap(api.projects[':id'].rehearsals[':rid'].approval.$get({ param: { id, rid } }))).approval });
}

export function useRequestApproval(id: string, rid: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (note: string) => (await unwrap(api.projects[':id'].rehearsals[':rid'].approval.$post({ param: { id, rid }, json: { note } }))).approval,
    onSuccess: (a) => {
      client.setQueryData(queryKeys.approval(id, rid), a);
      void client.invalidateQueries({ queryKey: queryKeys.approvals(id) });
    },
  });
}

export function useDecideApproval(id: string, rid: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ aid, decision, comment }: { aid: string; decision: 'approved' | 'changes_requested'; comment: string }) =>
      (await unwrap(api.projects[':id'].approvals[':aid'].decision.$post({ param: { id, aid }, json: { decision, comment } }))).approval,
    onSuccess: (a) => {
      client.setQueryData(queryKeys.approval(id, rid), a);
      void client.invalidateQueries({ queryKey: queryKeys.approvals(id) });
    },
  });
}

export function useApprovals(id: string) {
  return useQuery({ queryKey: queryKeys.approvals(id), queryFn: async () => (await unwrap(api.projects[':id'].approvals.$get({ param: { id }, query: { status: 'pending' } }))).approvals });
}

export function useWebhooks(id: string) {
  return useQuery({ queryKey: queryKeys.webhooks(id), queryFn: async () => (await unwrap(api.projects[':id'].webhooks.$get({ param: { id } }))).webhooks });
}

export function useCreateWebhook(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (json: { url: string; events: ('rehearsal.finished' | 'approval.requested' | 'approval.decided')[] }) => unwrap(api.projects[':id'].webhooks.$post({ param: { id }, json })),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.webhooks(id) }),
  });
}

export function useDeleteWebhook(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (hid: string) => unwrap(api.projects[':id'].webhooks[':hid'].$delete({ param: { id, hid } })),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.webhooks(id) }),
  });
}

export function useTestWebhook(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (hid: string) => (await unwrap(api.projects[':id'].webhooks[':hid'].test.$post({ param: { id, hid } }))).delivery,
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.webhooks(id) }),
  });
}

export function useAudit(id: string, enabled: boolean) {
  return useQuery({ queryKey: queryKeys.audit(id), enabled, queryFn: async () => (await unwrap(api.projects[':id'].audit.$get({ param: { id }, query: {} }))).events });
}

export function useUsage(id: string) {
  return useQuery({ queryKey: queryKeys.usage(id), queryFn: () => unwrap(api.projects[':id'].usage.$get({ param: { id } })) });
}
