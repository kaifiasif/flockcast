import { Hono } from 'hono';
import type { AppContext } from '../context.ts';
import type { Session } from '../modules/auth/auth.service.ts';

/** Set by requireSession on every route behind it: who is signed in, and their scoped data. */
export type AppEnv = { Variables: { requestId: string; session: Session; ctx: AppContext } };

export const router = () => new Hono<AppEnv>();
