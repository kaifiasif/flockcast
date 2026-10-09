import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import { queryKeys } from '@/api/query-client';
import type { AuthSession, PublicUser } from '@/api/types';

/** Who is signed in, and whether this server takes new accounts. Never fails with 401. */
export function useSession() {
  return useQuery({ queryKey: queryKeys.session, queryFn: () => unwrap(api.auth.session.$get()), staleTime: Number.POSITIVE_INFINITY, retry: 1 });
}

/**
 * Signing in or out swaps whose data the app shows, so every cached query is dropped, not just
 * refetched: nothing from the last account may flash on screen for the next one.
 */
function useSignedIn() {
  const client = useQueryClient();
  return (user: PublicUser | null) => {
    client.removeQueries({ predicate: (q) => q.queryKey[0] !== queryKeys.session[0] });
    client.setQueryData<AuthSession>(queryKeys.session, (prev) => ({ signup_open: prev?.signup_open ?? false, first_account: false, user }));
  };
}

export function useLogin() {
  const signedIn = useSignedIn();
  return useMutation({
    mutationFn: (input: { email: string; password: string; code?: string }) => unwrap(api.auth.login.$post({ json: input })),
    onSuccess: ({ user }) => signedIn(user),
  });
}

export function useSignup() {
  const signedIn = useSignedIn();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) => unwrap(api.auth.signup.$post({ json: input })),
    onSuccess: ({ user }) => signedIn(user),
  });
}

export function useLogout() {
  const signedIn = useSignedIn();
  return useMutation({ mutationFn: () => unwrap(api.auth.logout.$post()), onSettled: () => signedIn(null) });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { current_password: string; new_password: string }) => unwrap(api.auth.password.$post({ json: input })),
  });
}

function useUserUpdate() {
  const client = useQueryClient();
  return ({ user }: { user: PublicUser }) => client.setQueryData<AuthSession>(queryKeys.session, (prev) => prev && { ...prev, user });
}

export function useStartMfaSetup() {
  return useMutation({ mutationFn: () => unwrap(api.auth.mfa.setup.$post()) });
}

export function useEnableMfa() {
  return useMutation({ mutationFn: (code: string) => unwrap(api.auth.mfa.enable.$post({ json: { code } })), onSuccess: useUserUpdate() });
}

export function useDisableMfa() {
  return useMutation({
    mutationFn: (input: { password: string; code: string }) => unwrap(api.auth.mfa.disable.$post({ json: input })),
    onSuccess: useUserUpdate(),
  });
}
