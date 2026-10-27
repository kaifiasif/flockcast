import { Hono } from 'hono';
import type { AppContext, AppServices } from '../context.ts';
import type { Session } from '../modules/auth/auth.service.ts';

/** Set by requireSession on every route behind it: who is signed in, their scoped data, and the shared services. */
export type AppEnv = { Variables: { requestId: string; session: Session; ctx: AppContext; app: AppServices } };

export const router = () => new Hono<AppEnv>();
