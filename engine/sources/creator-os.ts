/**
 * Example app adapter: Creator OS (0.9+). Reads a run's draft from Creator OS's own SQLite tables and
 * keeps rehearsal closed until the creator has decided on it, so simulated reactions never sway the
 * decision the study measures. The scope is the Creator OS user id: a run owned by anyone else reads
 * as not found.
 *
 * This is the only file that knows Creator OS's schema. Another app writes its own ~40-line adapter
 * with the same shape (see docs/integration.md).
 */
import { RehearsalError } from '../core.ts';
import type { SqlDb } from '../stores/sqlite.ts';
import { sentencesOf } from '../summarize.ts';
import type { Source } from '../types.ts';

const EXAMPLES = 25;

export interface CreatorOsOptions {
  /** Allow rehearsal before the decision (demos only: it breaks the blind study). */
  beforeDecision?: boolean;
}

export function creatorOsSource(db: SqlDb, { beforeDecision = false }: CreatorOsOptions = {}): Source {
  return {
    name: 'creator-os',
    load(userId, ref) {
      const runId = String((ref as { run_id?: unknown })?.run_id ?? '');
      const run = db.get<{ id: string; format: string }>('SELECT id, format FROM runs WHERE id = ? AND user_id = ?', runId, userId);
      if (!run) throw new RehearsalError(404, 'NOT_FOUND', 'Run not found.');
      const draft = db.get<{ id: string }>('SELECT id FROM drafts WHERE run_id = ?', run.id);
      if (!draft) throw new RehearsalError(409, 'GATE_CLOSED', 'This run has no draft to rehearse yet.');
      const decision = db.get<{ decision: string; final_posts: string | string[] | null }>('SELECT decision, final_posts FROM decisions WHERE draft_id = ? ORDER BY decided_at DESC LIMIT 1', draft.id);
      const finalPosts: string[] | null = typeof decision?.final_posts === 'string' ? JSON.parse(decision.final_posts) : (decision?.final_posts ?? null);

      const rows = db.all<{ id: string; post_position: number; text: string }>('SELECT id, post_position, text FROM draft_sentences WHERE draft_id = ? ORDER BY post_position, position', draft.id);
      const grouped: string[][] = [];
      for (const r of rows) (grouped[r.post_position - 1] ??= []).push(r.text);
      const generated = grouped.filter(Boolean).map((s) => s.join(' '));
      let posts = generated;
      let sentences = rows.map((r) => ({ id: r.id as string | null, text: r.text }));
      if (finalPosts?.length && finalPosts.join('\n\n') !== generated.join('\n\n')) {
        // edited before accepting: rehearse the final text; sentence ids no longer line up
        posts = finalPosts;
        sentences = posts.flatMap(sentencesOf).map((text) => ({ id: null, text }));
      }
      const examples = db.all<{ text: string; published_at: string | null }>(
        'SELECT text, published_at FROM archive_pieces WHERE user_id = ? AND retired = 0 AND is_holdout = 0 ORDER BY published_at DESC LIMIT ?',
        userId, EXAMPLES,
      );

      let gate: { open: boolean; reason?: string } = { open: true };
      if (!decision && !beforeDecision) gate = { open: false, reason: 'Decide on the draft first. Rehearsal opens after your decision so it does not sway it.' };
      else if (decision?.decision === 'reject') gate = { open: false, reason: 'This draft was rejected, so there is nothing to rehearse.' };

      return { subject: `run:${run.id}`, title: (posts[0] ?? '').replace(/\s+/g, ' ').slice(0, 80), input: { posts, sentences, examples }, gate };
    },
  };
}
