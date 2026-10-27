import { z } from 'zod';
import { STAKEHOLDERS, STUDY_KINDS } from '../../../engine/index.ts';

export const ProjectStudyParam = z.object({ id: z.uuid(), sid: z.uuid() });

const Segment = z.object({ name: z.string().trim().min(1, 'Name each group.').max(40), about: z.string().trim().max(300).default('') });
const Segments = (max: number) => z.array(Segment).min(1, 'Add at least one group of people.').max(max, `Use up to ${max} groups.`);

export const StudyInput = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('focus_group'),
    topic: z.string().trim().min(1, 'Give the session a topic.').max(120),
    material: z.string().trim().min(1, 'Add what the group should see.').max(4000),
    questions: z.array(z.string().trim().min(1).max(300)).min(1, 'Ask at least one question.').max(5, 'Ask up to five questions.'),
    segments: Segments(4),
    panelists: z.number().int().min(4).max(12).default(8),
  }),
  z.object({
    kind: z.literal('message_test'),
    goal: z.string().trim().max(300).nullish().transform((v) => v || null),
    messages: z.array(z.object({ label: z.string().trim().max(40).default(''), text: z.string().trim().min(1, 'A version is empty.').max(2000) })).min(2, 'Test at least two versions.').max(4, 'Test up to four versions.'),
    segments: Segments(5),
    per_segment: z.number().int().min(2).max(10).default(5),
  }),
  z.object({
    kind: z.literal('crisis'),
    situation: z.string().trim().min(1, 'Describe what happened.').max(2000),
    statement: z.string().trim().min(1, 'Add the statement you plan to put out.').max(3000),
    stakeholders: z.array(z.enum(STAKEHOLDERS)).min(1, 'Pick at least one group.').max(STAKEHOLDERS.length).default(['customers', 'press', 'critics']),
    rounds: z.union([z.literal(1), z.literal(2)]).default(2),
  }),
]);

export const StudyListQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).optional(), kind: z.enum(STUDY_KINDS).optional() });

const Words = (max: number, len: number) => z.array(z.string().trim().max(len)).max(max).default([]).transform((a) => a.filter(Boolean));
export const BrandInput = z.object({
  voice: z.string().trim().max(600).default(''),
  banned: Words(50, 60),
  required: Words(10, 120),
  notes: z.string().trim().max(1000).default(''),
});
