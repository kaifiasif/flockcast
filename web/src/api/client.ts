/**
 * Typed API client. Request and response types come from the server's own route definitions
 * (Hono RPC), so the web app cannot drift from the API: change a route and this fails to compile.
 */
import type { App } from '@server/app.ts';
import { hc, type ClientResponse } from 'hono/client';
import { ApiError } from './errors';

/*
 * The session is an HttpOnly cookie the browser sends by itself; scripts never see it. All this
 * client does about auth is notice when the server stops recognising the session (it expired, or
 * the password was changed on another device) so the app can show the log-in screen again.
 */
let onSignedOut: (() => void) | null = null;
export const whenSignedOut = (listener: () => void) => {
  onSignedOut = listener;
};
const isAuthRoute = (input: RequestInfo | URL) => String(input instanceof Request ? input.url : input).includes('/api/auth/');

async function sessionFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, { ...init, credentials: 'same-origin' });
  if (res.status === 401 && !isAuthRoute(input)) onSignedOut?.();
  return res;
}

export const client = hc<App>('/', { fetch: sessionFetch });
export const api = client.api;

/** Turns a typed response into its JSON body, or throws the server's error as an ApiError. */
export async function unwrap<T>(request: Promise<ClientResponse<T, number, 'json'>>): Promise<T> {
  let res: ClientResponse<T, number, 'json'>;
  try {
    res = await request;
  } catch {
    throw new ApiError(0, 'NETWORK', 'Could not reach the Flockcast server. Is it running?');
  }
  if (!res.ok) throw await ApiError.fromResponse(res as unknown as Response);
  return (await res.json()) as T;
}
