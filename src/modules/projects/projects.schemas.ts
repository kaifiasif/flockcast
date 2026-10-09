import { z } from 'zod';
import { PLATFORM_IDS } from '../../../engine/index.ts';

export const IdParam = z.object({ id: z.uuid() });
export const ProjectRehearsalParam = z.object({ id: z.uuid(), rid: z.uuid() });
export const ProjectKeyParam = z.object({ id: z.uuid(), kid: z.uuid() });

const Example = z.object({
  text: z.string().trim().min(1).max(1000),
  published_at: z.iso.datetime({ offset: true }).nullish(),
});

export const ProjectInput = z.object({
  name: z.string().trim().min(1, 'Give the project a name.').max(80),
  description: z.string().trim().max(500).default(''),
  platform: z.enum(PLATFORM_IDS).default('x'),
  handle: z.string().trim().min(1, 'Say how the author appears, like @kaifi.').max(60),
  audience: z.string().trim().max(2000).nullish().transform((v) => v || null),
  examples: z.array(Example).max(25, 'Keep it to 25 past posts.').default([]),
  personas: z.number().int().min(2).max(30).default(12),
  rounds: z.number().int().min(1).max(40).default(10),
});

export const RehearsalInput = z.object({
  /** One post, or thread parts separated by a line holding only "---". */
  text: z.string().trim().min(1, 'Paste the post you want to rehearse.').max(10_000),
  title: z.string().trim().max(120).optional(),
  /** Your own id for what is being rehearsed (a draft id), so reruns form one history. */
  subject: z.string().trim().min(1).max(200).optional(),
  audience: z.string().trim().max(2000).optional(),
  platform: z.enum(PLATFORM_IDS).optional(),
  personas: z.number().int().min(2).max(30).optional(),
  rounds: z.number().int().min(1).max(40).optional(),
  force: z.boolean().optional(),
});

export const InterviewInput = z.object({
  agent_id: z.number().int().min(1).max(10_000),
  prompt: z.string().trim().min(1, 'Ask a question.').max(1000),
});

export const KeyInput = z.object({ name: z.string().trim().min(1, 'Name the key after where it is used.').max(60) });

export const ListQuery = z.object({
  subject: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
