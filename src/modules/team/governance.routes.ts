import { conflict, notFound } from '../../core/errors.ts';
import { PLANS, requireFeature } from '../../core/plans.ts';
import { checkWebhookUrl, newWebhookSecret } from '../../core/webhooks.ts';
import { uuidv7, nowIso } from '../../domain/ids.ts';
import { router } from '../../http/types.ts';
import { validate } from '../../http/validate.ts';
import { ownProject } from '../projects/access.ts';
import { IdParam, ProjectRehearsalParam } from '../projects/projects.schemas.ts';
import { engineCall } from '../rehearsals/rehearsal-errors.ts';
import { ApprovalDecision, ApprovalParam, ApprovalQuery, ApprovalRequest, AuditQuery, ExportQuery, HookParam, WebhookInput } from './team.schemas.ts';
import { toCsv } from './csv.ts';

const MAX_HOOKS = 5;

/** Approvals, the audit log, webhooks, usage and export: the controls a team or a brand needs. */
export function governanceRoutes() {
  return router()
    // ------------------------------------------------------------ approvals
    .get('/projects/:id/approvals', validate('param', IdParam), validate('query', ApprovalQuery), (c) => {
      const ctx = c.var.ctx;
      const project = ownProject(ctx, c.req.valid('param').id);
      return c.json({ approvals: ctx.governance.approvals(project.id, c.req.valid('query').status) });
    })
    .get('/projects/:id/rehearsals/:rid/approval', validate('param', ProjectRehearsalParam), async (c) => {
      const ctx = c.var.ctx;
      const { id, rid } = c.req.valid('param');
      ownProject(ctx, id);
      await engineCall(() => ctx.rehearsals.get(id, rid));
      return c.json({ approval: ctx.governance.latestApproval(id, rid) ?? null });
    })
    .post('/projects/:id/rehearsals/:rid/approval', validate('param', ProjectRehearsalParam), validate('json', ApprovalRequest), async (c) => {
      const ctx = c.var.ctx;
      const { id, rid } = c.req.valid('param');
      const project = ownProject(ctx, id, 'edit');
      requireFeature(ctx.planOf(project), 'approvals');
      const r = await engineCall(() => ctx.rehearsals.get(id, rid));
      if (r.status !== 'done') throw conflict('Ask for approval once the rehearsal has finished, so reviewers can see the results.');
      const aid = uuidv7();
      ctx.governance.requestApproval({ id: aid, project_id: id, rehearsal_id: rid, note: c.req.valid('json').note, at: nowIso() });
      const approval = ctx.governance.latestApproval(id, rid)!;
      ctx.audit(project, 'approval.requested', rid, { approval_id: aid });
      c.var.app.webhooks.emit(id, 'approval.requested', { approval_id: aid, rehearsal_id: rid, title: r.title, note: approval.note, requested_by: approval.requested_by_email });
      return c.json({ approval }, 201);
    })
    .post('/projects/:id/approvals/:aid/decision', validate('param', ApprovalParam), validate('json', ApprovalDecision), (c) => {
      const ctx = c.var.ctx;
      const { id, aid } = c.req.valid('param');
      const project = ownProject(ctx, id, 'review');
      requireFeature(ctx.planOf(project), 'approvals');
      const open = ctx.governance.approvals(id, 'pending').find((a) => a.id === aid);
      if (!open) throw notFound('Pending approval');
      if (open.requested_by === ctx.userId) throw conflict('Someone other than the person who asked has to decide.');
      const { decision, comment } = c.req.valid('json');
      if (!ctx.governance.decide(id, aid, decision, comment, nowIso())) throw notFound('Pending approval');
      const approval = ctx.governance.approvals(id).find((a) => a.id === aid)!;
      ctx.audit(project, `approval.${decision}`, open.rehearsal_id, { approval_id: aid, comment });
      c.var.app.webhooks.emit(id, 'approval.decided', { approval_id: aid, rehearsal_id: open.rehearsal_id, title: open.rehearsal_title, decision, comment, decided_by: approval.decided_by_email });
      return c.json({ approval });
    })
    .post('/projects/:id/approvals/:aid/withdraw', validate('param', ApprovalParam), (c) => {
      const ctx = c.var.ctx;
      const { id, aid } = c.req.valid('param');
      const project = ownProject(ctx, id, 'edit');
      if (!ctx.governance.withdraw(id, aid)) throw notFound('Pending approval');
      ctx.audit(project, 'approval.withdrawn', aid);
      return c.json({ ok: true });
    })

    // ------------------------------------------------------------ audit log
    .get('/projects/:id/audit', validate('param', IdParam), validate('query', AuditQuery), (c) => {
      const ctx = c.var.ctx;
      const project = ownProject(ctx, c.req.valid('param').id, 'manage');
      requireFeature(ctx.planOf(project), 'audit');
      const q = c.req.valid('query');
      return c.json({ events: ctx.governance.audit(project.id, { limit: q.limit ?? 100, before: q.before }) });
    })
    .get('/projects/:id/audit/csv', validate('param', IdParam), (c) => {
      const ctx = c.var.ctx;
      const project = ownProject(ctx, c.req.valid('param').id, 'manage');
      requireFeature(ctx.planOf(project), 'audit');
      const events = ctx.governance.audit(project.id, { limit: 500 });
      c.header('content-disposition', `attachment; filename="flockcast-audit-${project.id.slice(0, 8)}.csv"`);
      return c.body(toCsv(['at', 'actor', 'action', 'target', 'details'], events.map((e) => [e.at, e.actor, e.action, e.target, JSON.stringify(e.details)])), 200, { 'content-type': 'text/csv; charset=utf-8' });
    })

    // ------------------------------------------------------------ webhooks
    .get('/projects/:id/webhooks', validate('param', IdParam), (c) => {
      const ctx = c.var.ctx;
      const project = ownProject(ctx, c.req.valid('param').id, 'manage');
      return c.json({ webhooks: ctx.hooks.list(project.id) });
    })
    .post('/projects/:id/webhooks', validate('param', IdParam), validate('json', WebhookInput), (c) => {
      const ctx = c.var.ctx;
      const project = ownProject(ctx, c.req.valid('param').id, 'manage');
      requireFeature(ctx.planOf(project), 'webhooks');
      if (ctx.hooks.count(project.id) >= MAX_HOOKS) throw conflict(`A project can have up to ${MAX_HOOKS} webhooks.`);
      const { url, events } = c.req.valid('json');
      checkWebhookUrl(url, { allowPrivate: c.var.app.config.webhooks.allowPrivate });
      const id = uuidv7();
      const secret = newWebhookSecret();
      ctx.hooks.create({ id, project_id: project.id, url, secret, events: [...new Set(events)], at: nowIso() });
      ctx.audit(project, 'webhook.created', id, { url, events });
      // the only time the secret leaves the server
      return c.json({ webhook: ctx.hooks.list(project.id).find((h) => h.id === id), secret }, 201);
    })
    .delete('/projects/:id/webhooks/:hid', validate('param', HookParam), (c) => {
      const ctx = c.var.ctx;
      const { id, hid } = c.req.valid('param');
      const project = ownProject(ctx, id, 'manage');
      if (!ctx.hooks.remove(id, hid)) throw notFound('Webhook');
      ctx.audit(project, 'webhook.deleted', hid);
      return c.json({ ok: true });
    })
    .post('/projects/:id/webhooks/:hid/test', validate('param', HookParam), async (c) => {
      const ctx = c.var.ctx;
      const { id, hid } = c.req.valid('param');
      ownProject(ctx, id, 'manage');
      if (!ctx.hooks.list(id).some((h) => h.id === hid)) throw notFound('Webhook');
      return c.json({ delivery: await c.var.app.webhooks.ping(id, hid) });
    })

    // ------------------------------------------------------------ usage and export
    .get('/projects/:id/usage', validate('param', IdParam), (c) => {
      const ctx = c.var.ctx;
      const project = ownProject(ctx, c.req.valid('param').id);
      const plan = ctx.planOf(project);
      return c.json({
        plan: { id: plan.id, name: plan.name, limits: plan.limits, features: plan.features },
        plans_enabled: c.var.app.config.plans,
        month: { rehearsals: ctx.usedThisMonth(project) },
        members: ctx.team.members(project.id).length,
      });
    })
    .get('/projects/:id/export', validate('param', IdParam), validate('query', ExportQuery), (c) => {
      const ctx = c.var.ctx;
      const project = ownProject(ctx, c.req.valid('param').id, 'edit');
      requireFeature(ctx.planOf(project), 'export');
      const rows = ctx.rehearsals.list(project.id, { limit: 200 });
      ctx.audit(project, 'project.exported', '', { format: c.req.valid('query').format, rehearsals: rows.length });
      const name = `flockcast-${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'project'}`;
      if (c.req.valid('query').format === 'csv') {
        c.header('content-disposition', `attachment; filename="${name}.csv"`);
        const head = ['id', 'created_at', 'title', 'status', 'variant', 'platform', 'followers', 'rounds', 'likes', 'reposts', 'replies', 'quotes', 'pushback_share', 'reads_as_ai', 'real_likes', 'real_reposts', 'real_replies', 'real_quotes', 'text'];
        const body = rows.map((r) => {
          const x = r.result;
          return [r.id, r.created_at, r.title, r.status, r.variant ?? '', r.settings.platform, r.settings.personas, r.settings.rounds, x?.counts.likes ?? '', x?.counts.reposts ?? '', x?.counts.replies ?? '', x?.counts.quotes ?? '', x?.pushback_share ?? '', x?.ai_check?.score ?? '', r.outcome?.likes ?? '', r.outcome?.reposts ?? '', r.outcome?.replies ?? '', r.outcome?.quotes ?? '', r.posts.join('\n---\n')];
        });
        return c.body(toCsv(head, body), 200, { 'content-type': 'text/csv; charset=utf-8' });
      }
      c.header('content-disposition', `attachment; filename="${name}.json"`);
      return c.json({ project: { id: project.id, name: project.name, platform: project.platform, handle: project.handle }, exported_at: nowIso(), rehearsals: rows });
    })
    .get('/plans', (c) => c.json({ plans: Object.values(PLANS), enabled: c.var.app.config.plans }));
}
