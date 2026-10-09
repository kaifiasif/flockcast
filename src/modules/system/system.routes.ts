import { PLATFORMS } from '../../../engine/index.ts';
import type { AppServices } from '../../context.ts';
import { router } from '../../http/types.ts';

/** Public: platforms poll this to decide whether the server is up. */
export function healthRoutes(app: AppServices) {
  return router().get('/health', (c) => {
    // healthy means the database answers, not just that the process is up
    app.db.get('SELECT 1');
    return c.json({ ok: true });
  });
}

/** What the UI needs to know about this server. Says which model runs, never its key. */
export function systemRoutes(app: AppServices) {
  return router().get('/config', (c) =>
    c.json({
      engine: app.engine,
      platforms: Object.values(PLATFORMS).map(({ id, name, replyChars, verbs }) => ({ id, name, reply_chars: replyChars, verbs })),
      limits: { ...app.rehearsals.limits },
      defaults: app.rehearsals.defaults,
      signup: app.config.signup,
    }),
  );
}
