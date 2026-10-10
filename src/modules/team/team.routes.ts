import { createHash, randomBytes } from 'node:crypto';
import { AppError, ErrorCode, notFound } from '../../core/errors.ts';
import { requireFeature, requireLimit } from '../../core/plans.ts';
import { nowIso, uuidv7 } from '../../domain/ids.ts';
import { router } from '../../http/types.ts';
import { validate } from '../../http/validate.ts';
import { ownProject } from '../projects/access.ts';
import { IdParam } from '../projects/projects.schemas.ts';
import { AcceptInput, InviteInput, InviteParam, MemberParam, RoleInput } from './team.schemas.ts';

const INVITE_DAYS = 7;
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

/** Members and invite links. Anyone on a project sees who else is; only the owner adds, changes or removes people. */
export function teamRoutes() {
  return router()
    .get('/projects/:id/members', validate('param', IdParam), (c) => {
      const ctx = c.var.ctx;
      const project = ownProject(ctx, c.req.valid('param').id);
      return c.json({ members: ctx.team.members(project.id), invites: project.role === 'owner' ? ctx.team.invites(project.id) : [] });
    })
    .post('/projects/:id/invites', validate('param', IdParam), validate('json', InviteInput), (c) => {
      const ctx = c.var.ctx;
      const project = ownProject(ctx, c.req.valid('param').id, 'manage');
      const plan = ctx.planOf(project);
      requireFeature(plan, 'members');
      requireLimit(plan, 'members', ctx.team.memberCount(project.id));
      const token = `inv_${randomBytes(32).toString('base64url')}`;
      const at = new Date();
      const id = uuidv7();
      const { role } = c.req.valid('json');
      ctx.team.createInvite({ id, project_id: project.id, role, token_hash: hashToken(token), at: at.toISOString(), expires_at: new Date(at.getTime() + INVITE_DAYS * 86_400_000).toISOString() });
      ctx.audit(project, 'invite.created', id, { role });
      // the only time the token leaves the server; the web app turns it into a link
      return c.json({ invite: ctx.team.invites(project.id).find((i) => i.id === id), token, path: `#/join/${token}` }, 201);
    })
    .delete('/projects/:id/invites/:iid', validate('param', InviteParam), (c) => {
      const ctx = c.var.ctx;
      const { id, iid } = c.req.valid('param');
      const project = ownProject(ctx, id, 'manage');
      if (!ctx.team.revokeInvite(id, iid, nowIso())) throw notFound('Invite');
      ctx.audit(project, 'invite.revoked', iid);
      return c.json({ ok: true });
    })
    .put('/projects/:id/members/:uid', validate('param', MemberParam), validate('json', RoleInput), (c) => {
      const ctx = c.var.ctx;
      const { id, uid } = c.req.valid('param');
      const project = ownProject(ctx, id, 'manage');
      const { role } = c.req.valid('json');
      if (!ctx.team.setRole(id, uid, role)) throw notFound('Member');
      ctx.audit(project, 'member.role_changed', uid, { role });
      return c.json({ members: ctx.team.members(id) });
    })
    .delete('/projects/:id/members/:uid', validate('param', MemberParam), (c) => {
      const ctx = c.var.ctx;
      const { id, uid } = c.req.valid('param');
      // the owner removes anyone; anyone may leave
      const project = ownProject(ctx, id, uid === ctx.userId ? 'view' : 'manage');
      if (project.role === 'owner' && uid === ctx.userId) throw new AppError(409, ErrorCode.INVALID_STATE, 'The owner cannot leave their own project. Delete it instead.');
      if (!ctx.team.remove(id, uid)) throw notFound('Member');
      ctx.audit(project, uid === ctx.userId ? 'member.left' : 'member.removed', uid);
      return c.json({ ok: true });
    })
    .post('/invites/accept', validate('json', AcceptInput), (c) => {
      const ctx = c.var.ctx;
      const joined = ctx.team.accept(hashToken(c.req.valid('json').token), nowIso());
      if (!joined) throw new AppError(404, ErrorCode.NOT_FOUND, 'This invite link has expired, was already used, or was withdrawn. Ask for a new one.');
      ctx.audit({ id: joined.project_id }, 'member.joined', ctx.userId, { role: joined.role });
      return c.json({ project: ownProject(ctx, joined.project_id) });
    });
}
