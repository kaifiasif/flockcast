/**
 * Signed webhooks. Each delivery is a JSON POST with
 *   Flockcast-Event: rehearsal.finished
 *   Flockcast-Delivery: <uuid>
 *   Flockcast-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>" with the hook's secret>
 * so receivers can check it came from this server and is fresh.
 *
 * Hooks point at URLs a user typed, so the server must not become a way into its own network: only
 * https (http only when the operator allows private targets for local testing), no credentials in the
 * URL, and every address the name resolves to is checked at connect time, which also defeats DNS
 * rebinding between the check and the request.
 */
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { Database } from '../db/client.ts';
import { hookById, hooksFor, recordDelivery } from '../db/repositories/webhooks.repository.ts';
import { badRequest } from './errors.ts';
import type { Logger } from './logger.ts';

export const WEBHOOK_EVENTS = ['rehearsal.finished', 'approval.requested', 'approval.decided'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number] | 'ping';

export const newWebhookSecret = () => `whsec_${randomBytes(32).toString('base64url')}`;

export function sign(secret: string, body: string, t = Math.floor(Date.now() / 1000)): string {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
}

function v4Private(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
}

/** Loopback, private, link-local, carrier-grade NAT, multicast and reserved ranges, in v4 and v6. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return v4Private(ip);
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return v4Private(mapped[1]);
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith('ff') || v6.startsWith('64:ff9b:') || v6.startsWith('2001:db8');
}

/** Checks the shape of a hook URL before it is saved. Addresses are checked again on every delivery. */
export function checkWebhookUrl(raw: string, { allowPrivate = false } = {}): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest('Give the full webhook URL, starting with https://.');
  }
  if (url.protocol !== 'https:' && !(allowPrivate && url.protocol === 'http:')) throw badRequest('Webhook URLs must use https.');
  if (url.username || url.password) throw badRequest('Leave credentials out of the URL; check the signature instead.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!allowPrivate && (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || (isIP(host) && isPrivateAddress(host)))) {
    throw badRequest('Webhooks cannot point at private or local addresses.');
  }
  return url;
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** A DNS lookup that refuses private answers, used by the socket itself so the check and the connect agree. */
function guardedLookup(allowPrivate: boolean) {
  return (hostname: string, options: object, cb: LookupCb) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return cb(err, []);
      const list = addresses as LookupAddress[];
      const bad = !allowPrivate && list.some((a) => isPrivateAddress(a.address));
      if (bad || !list.length) return cb(Object.assign(new Error('The webhook host resolves to a private address.'), { code: 'EPRIVATE' }), []);
      if ((options as { all?: boolean }).all) cb(null, list);
      else cb(null, list[0].address, list[0].family);
    });
  };
}

function post(url: URL, body: string, headers: Record<string, string>, allowPrivate: boolean, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = send(url, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)), ...headers }, lookup: guardedLookup(allowPrivate) as never, timeout: timeoutMs }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('timeout', () => req.destroy(new Error(`No answer within ${timeoutMs / 1000} seconds.`)));
    req.on('error', reject);
    req.end(body);
  });
}

export interface WebhookSender {
  /** Queues deliveries of one event to every hook of a project that asked for it. Never throws. */
  emit(projectId: string, event: WebhookEvent, data: Record<string, unknown>): void;
  /** Sends a ping now and reports how it went, for the "Send test" button. */
  ping(projectId: string, hookId: string): Promise<{ status: number | null; error: string | null }>;
}

export function createWebhookSender(opts: { db: Database; log: Logger; allowPrivate?: boolean; retryDelaysMs?: number[]; timeoutMs?: number; userAgent?: string }): WebhookSender {
  const allowPrivate = opts.allowPrivate ?? false;
  const delays = opts.retryDelaysMs ?? [2_000, 30_000];
  const timeoutMs = opts.timeoutMs ?? 5_000;

  async function deliver(hook: { id: string; url: string; secret: string }, event: WebhookEvent, data: Record<string, unknown>, retry: boolean) {
    const id = randomUUID();
    const body = JSON.stringify({ id, event, created_at: new Date().toISOString(), data });
    for (let attempt = 0; ; attempt++) {
      let status: number | null = null;
      let error: string | null = null;
      try {
        status = await post(checkWebhookUrl(hook.url, { allowPrivate }), body, { 'flockcast-event': event, 'flockcast-delivery': id, 'flockcast-signature': sign(hook.secret, body), 'user-agent': opts.userAgent ?? 'Flockcast-Webhooks/1.0' }, allowPrivate, timeoutMs);
        if (status < 200 || status >= 300) error = `The receiver answered ${status}.`;
      } catch (e) {
        error = (e as Error).message;
      }
      recordDelivery(opts.db, hook.id, new Date().toISOString(), status, error);
      if (!error || !retry || attempt >= delays.length || (status !== null && status >= 400 && status < 500 && status !== 429)) {
        if (error) opts.log.warn('webhook_failed', { webhook_id: hook.id, event, status, error });
        return { status, error };
      }
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }

  return {
    emit(projectId, event, data) {
      let hooks: { id: string; url: string; secret: string }[];
      try {
        hooks = hooksFor(opts.db, projectId, event);
      } catch (e) {
        opts.log.warn('webhook_lookup_failed', { project_id: projectId, error: (e as Error).message });
        return;
      }
      for (const hook of hooks) void deliver(hook, event, data, true);
    },
    async ping(projectId, hookId) {
      const hook = hookById(opts.db, projectId, hookId);
      if (!hook) return { status: null, error: 'Webhook not found.' };
      return deliver(hook, 'ping', { project_id: projectId, message: 'Flockcast is connected.' }, false);
    },
  };
}
