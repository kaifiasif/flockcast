import { z } from 'zod';
import { BILLING, CURRENCIES } from '../../../engine/index.ts';

export const ProjectAdviceParam = z.object({ id: z.uuid(), aid: z.uuid() });

export const AdviceInput = z.object({
  product: z.string().trim().min(1, 'Give your product a name.').max(80),
  pitch: z.string().trim().min(20, 'Describe what it does in at least 20 characters.').max(2000),
  audience: z.string().trim().max(500).nullish().transform((v) => v || null),
  price_idea: z.string().trim().max(120).nullish().transform((v) => v || null),
  competitors: z.array(z.string().trim().min(1).max(60)).max(8, 'Name up to 8 competitors.').default([]),
  billing: z.enum(BILLING).default('subscription'),
  currency: z.enum(CURRENCIES).default('USD'),
  buyers: z.number().int().min(5).max(30).default(12),
});

export const AdviceListQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).optional() });
