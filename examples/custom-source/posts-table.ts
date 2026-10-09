/**
 * A source adapter for any app: about forty lines that answer "given this scope and reference,
 * what text should the crowd read?". This one reads drafts from a hypothetical `posts` table.
 *
 * Rules every source follows:
 * - Only return rows the scope owns. Anything else is NOT_FOUND, never someone else's text.
 * - Give a stable `subject` per draft, so reruns form one history and share the daily cap.
 * - Close the gate (with a reason people can act on) when the text should not be rehearsed yet.
 */
import { RehearsalError, sentencesOf, type Source, type SqlDb } from '../../engine/index.ts';

export function postsTableSource(db: SqlDb): Source {
  return {
    name: 'posts',
    load(workspaceId, ref) {
      const postId = String((ref as { post_id?: unknown })?.post_id ?? '');
      const post = db.get<{ id: string; title: string; body: string; status: string }>(
        'SELECT id, title, body, status FROM posts WHERE id = ? AND workspace_id = ?',
        postId,
        workspaceId,
      );
      if (!post) throw new RehearsalError(404, 'NOT_FOUND', 'Post not found.');
      const parts = post.body.split(/\n\s*---\s*\n/).map((p) => p.trim()).filter(Boolean);
      const examples = db
        .all<{ body: string; published_at: string }>("SELECT body, published_at FROM posts WHERE workspace_id = ? AND status = 'published' ORDER BY published_at DESC LIMIT 25", workspaceId)
        .map((p) => ({ text: p.body, published_at: p.published_at }));
      return {
        subject: `post:${post.id}`,
        title: post.title,
        input: { posts: parts, sentences: parts.flatMap(sentencesOf).map((text) => ({ id: null, text })), examples },
        gate: post.status === 'archived' ? { open: false, reason: 'Archived posts cannot be rehearsed.' } : { open: true },
      };
    },
  };
}
