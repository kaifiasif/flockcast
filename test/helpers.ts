/** Test harness: the real app on an in-memory database, with an engine each test file can choose. */
import assert from 'node:assert/strict';
import { swarmEngine, type Engine, type Llm, type SearchAdapter } from '../engine/index.ts';
import { createApp } from '../src/app.ts';
import { configFromEnv, DEFAULT_RATE_LIMITS, loadEnv, type AppConfig } from '../src/config/env.ts';
import { createContext, type AppServices } from '../src/context.ts';
import { createLogger } from '../src/core/logger.ts';
import { openDatabase } from '../src/db/client.ts';
import { migrate } from '../src/db/migrate.ts';

/** Response bodies are whatever JSON the endpoint returns; tests assert on their shape directly. */
// biome-ignore lint/suspicious/noExplicitAny: response JSON is asserted structurally
export type Json = any;
export type Api = (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; body: Json; headers: Headers }>;

export interface Client {
  api: Api;
  cookie: string;
  user: { id: string; email: string };
}

export const TEST_PASSWORD = 'correct horse battery staple';
export const sessionCookie = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

export interface Harness {
  ctx: AppServices;
  app: ReturnType<typeof createApp>;
  /** A request with no session: the anonymous visitor, or an app calling with a key. */
  anon: Api;
  signUp(email: string, password?: string): Promise<Client>;
  settle(): Promise<void>;
  /** Signs up (first call only) and creates a project, returning the client and the project. */
  owner(): Promise<Client>;
  project(client: Client, extra?: Record<string, unknown>): Promise<Json>;
}

export function createHarness(opts: { engine?: Engine; llm?: Llm | null; search?: SearchAdapter[]; env?: Record<string, string>; config?: Partial<AppConfig> } = {}): Harness {
  const env = loadEnv({ NODE_ENV: 'test', ...opts.env });
  const db = openDatabase(':memory:');
  migrate(db);
  const quiet = createLogger({}, false);
  const ctx = createContext({
    db,
    engine: opts.engine ?? swarmEngine(),
    llm: opts.llm ?? null,
    search: opts.search ?? [],
    log: quiet,
    config: {
      ...configFromEnv(env),
      // every test signs up its own users from the same in-process "client"
      rateLimits: { ...DEFAULT_RATE_LIMITS, signups: { limit: 1000, windowMs: 60_000 } },
      ...opts.config,
    },
  });
  const app = createApp(ctx);

  const parse = async (res: Response) => {
    const text = await res.text();
    let body: Json = text;
    try {
      body = JSON.parse(text);
    } catch {
      // HTML and other text bodies stay as strings
    }
    return { status: res.status, body, headers: res.headers };
  };
  const apiFor = (cookie: string): Api => async (method, path, body, headers = {}) =>
    parse(
      await app.request(path, {
        method,
        headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      }),
    );

  const signUp: Harness['signUp'] = async (email, password = TEST_PASSWORD) => {
    const res = await app.request('/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(res.status, 201, await res.clone().text());
    const cookie = sessionCookie(res);
    const { user } = (await res.json()) as Json;
    return { api: apiFor(cookie), cookie, user };
  };
  let first: Promise<Client> | null = null;

  return {
    ctx,
    app,
    anon: apiFor(''),
    signUp,
    owner: () => (first ??= signUp('owner@example.com')),
    async settle() {
      await new Promise((r) => setTimeout(r, 5));
      await ctx.jobs.idle();
    },
    async project(client, extra = {}) {
      const r = await client.api('POST', '/api/projects', { name: 'Newsletter', handle: '@kaifi', personas: 6, rounds: 3, ...extra });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      return r.body.project;
    },
  };
}
