import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { RateLimit } from '../http/middleware/rate-limit.ts';

const flag = (fallback: '0' | '1') => z.enum(['0', '1', 'true', 'false']).default(fallback).transform((v) => v === '1' || v === 'true');

/** Environment is parsed once at boot. A bad value stops the server with a clear message instead of failing later. */
const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4180),
    REHEARSAL_DB: z.string().min(1).default('data/rehearsal.db'),
    /** closed (default): only the first account, or REHEARSAL_OWNER_EMAIL, may sign up. open: anyone who can reach the server. */
    REHEARSAL_SIGNUP: z.enum(['open', 'closed']).default('closed'),
    /** With closed sign-up, only this email may create the first account. Set it before deploying publicly. */
    REHEARSAL_OWNER_EMAIL: z.string().trim().toLowerCase().pipe(z.email()).optional(),
    /** Session cookies are Secure (HTTPS only) in production. Set to 0 only to try a production build over plain http on localhost. */
    COOKIE_SECURE: z.enum(['0', '1', 'true', 'false']).optional(),
    /** Set to 1 behind a proxy that sets X-Forwarded-For (Render, Fly), so rate limits apply per visitor. */
    TRUST_PROXY: flag('0'),

    /** swarm (default, built in) or mirofish (an external MiroFish backend at MIROFISH_URL). */
    REHEARSAL_ENGINE: z.enum(['swarm', 'mirofish']).default('swarm'),
    MIROFISH_URL: z.url().optional(),
    /** groq (default), gemini, openrouter, ollama, openai or custom. */
    REHEARSAL_LLM_PROVIDER: z.enum(['groq', 'gemini', 'openrouter', 'ollama', 'openai', 'custom']).optional(),
    REHEARSAL_LLM_API_KEY: z.string().min(1).optional(),
    REHEARSAL_LLM_BASE_URL: z.url().optional(),
    REHEARSAL_LLM_MODEL: z.string().min(1).max(200).optional(),
    /** Generic shared settings, read when the REHEARSAL_ ones are unset, so a key another app on the same host uses works as is. */
    LLM_API_KEY: z.string().min(1).optional(),
    LLM_BASE_URL: z.url().optional(),

    /** The Python 3.10+ that runs the agents (agents/flockcast_agents). Default: python3 on PATH. */
    FLOCKCAST_PYTHON: z.string().min(1).max(500).optional(),

    REHEARSALS_PER_SUBJECT_PER_DAY: z.coerce.number().int().min(1).max(1000).default(10),
    INTERVIEWS_PER_REHEARSAL: z.coerce.number().int().min(0).max(1000).default(25),

    /** Where the launch advisor searches: hackernews, reddit, web (needs TAVILY_API_KEY), sample. Default: hackernews,reddit, plus web with a Tavily key. */
    ADVISOR_SOURCES: z.string().regex(/^[a-z, ]*$/, 'use comma-separated source names').optional(),
    /** Optional free Tavily key (tavily.com) adds general web search to the advisor. */
    TAVILY_API_KEY: z.string().min(1).optional(),
    /** on: accounts have plans (Free, Creator, Studio, Enterprise) that decide which features they may use. off (default): everyone gets everything, as on a self-hosted server. */
    FLOCKCAST_PLANS: z.enum(['on', 'off']).default('off'),
    /** Lets webhooks reach private and local addresses (and plain http). Only for testing on your own machine. */
    WEBHOOKS_ALLOW_PRIVATE: flag('0'),
    ADVICE_PER_PROJECT_PER_DAY: z.coerce.number().int().min(1).max(1000).default(5),
  })
  .refine((e) => e.REHEARSAL_ENGINE !== 'mirofish' || e.MIROFISH_URL, { message: 'MIROFISH_URL is required with REHEARSAL_ENGINE=mirofish', path: ['MIROFISH_URL'] })
  .refine((e) => e.REHEARSAL_LLM_PROVIDER !== 'custom' || (e.REHEARSAL_LLM_BASE_URL && e.REHEARSAL_LLM_MODEL), {
    message: 'REHEARSAL_LLM_BASE_URL and REHEARSAL_LLM_MODEL are required with the custom provider',
    path: ['REHEARSAL_LLM_BASE_URL'],
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (source === process.env) {
    const dotenv = resolve(process.cwd(), '.env');
    if (existsSync(dotenv)) process.loadEnvFile(dotenv);
  }
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${problems}`);
  }
  return parsed.data;
}

/** Runtime settings the services read. */
export interface AppConfig {
  signup: 'open' | 'closed';
  ownerEmail: string | undefined;
  /** Secure cookies only travel over HTTPS; the session cookie also gets the __Host- prefix. */
  secureCookies: boolean;
  trustProxy: boolean;
  /** Whether plans gate features; off means everyone is on Enterprise. */
  plans: boolean;
  webhooks: { allowPrivate: boolean };
  limits: { rehearsalsPerSubjectPerDay: number; interviewsPerRehearsal: number; advicePerProjectPerDay: number };
  rateLimits: {
    /** every API call */
    api: RateLimit;
    /** calls that spend model tokens: starting a rehearsal, asking a follower, asking for launch advice */
    costly: RateLimit;
    /** failed log-ins, counted per visitor and per email */
    authFailures: RateLimit;
    /** new accounts per visitor */
    signups: RateLimit;
  };
}

export const DEFAULT_RATE_LIMITS: AppConfig['rateLimits'] = {
  api: { limit: 600, windowMs: 60_000 },
  costly: { limit: 60, windowMs: 10 * 60_000 },
  authFailures: { limit: 10, windowMs: 15 * 60_000 },
  signups: { limit: 5, windowMs: 60 * 60_000 },
};

export function configFromEnv(env: Env): AppConfig {
  return {
    signup: env.REHEARSAL_SIGNUP,
    ownerEmail: env.REHEARSAL_OWNER_EMAIL,
    secureCookies: env.COOKIE_SECURE === undefined ? env.NODE_ENV === 'production' : env.COOKIE_SECURE === '1' || env.COOKIE_SECURE === 'true',
    trustProxy: env.TRUST_PROXY,
    plans: env.FLOCKCAST_PLANS === 'on',
    webhooks: { allowPrivate: env.WEBHOOKS_ALLOW_PRIVATE },
    limits: { rehearsalsPerSubjectPerDay: env.REHEARSALS_PER_SUBJECT_PER_DAY, interviewsPerRehearsal: env.INTERVIEWS_PER_REHEARSAL, advicePerProjectPerDay: env.ADVICE_PER_PROJECT_PER_DAY },
    rateLimits: DEFAULT_RATE_LIMITS,
  };
}
