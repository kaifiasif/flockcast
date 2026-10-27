import { z } from 'zod';
import { WEBHOOK_EVENTS } from '../../core/webhooks.ts';

const MemberRole = z.enum(['editor', 'reviewer', 'viewer']);

export const MemberParam = z.object({ id: z.uuid(), uid: z.string().min(1).max(64) });
export const InviteParam = z.object({ id: z.uuid(), iid: z.string().min(1).max(64) });
export const HookParam = z.object({ id: z.uuid(), hid: z.string().min(1).max(64) });
export const ApprovalParam = z.object({ id: z.uuid(), aid: z.string().min(1).max(64) });

export const InviteInput = z.object({ role: MemberRole });
export const RoleInput = z.object({ role: MemberRole });
export const AcceptInput = z.object({ token: z.string().trim().regex(/^inv_[\w-]{43}$/, 'That invite link is not valid.') });

export const ApprovalRequest = z.object({ note: z.string().trim().max(1000).default('') });
export const ApprovalDecision = z.object({
  decision: z.enum(['approved', 'changes_requested']),
  comment: z.string().trim().max(1000).default(''),
});
export const ApprovalQuery = z.object({ status: z.enum(['pending', 'approved', 'changes_requested', 'withdrawn']).optional() });

export const AuditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  before: z.iso.datetime().optional(),
});

export const WebhookInput = z.object({
  url: z.string().trim().min(8).max(500),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, 'Pick at least one event.').max(WEBHOOK_EVENTS.length).default(['rehearsal.finished']),
});

export const ExportQuery = z.object({ format: z.enum(['json', 'csv']).default('json') });
