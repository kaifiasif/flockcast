import { useState, type ReactNode } from 'react';
import { isApiError } from '@/api/errors';
import type { Project, ProjectInput } from '@/api/types';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAppConfig } from '../api';

/** Past posts are typed as one block, separated by a line holding only "---". */
const SPLIT = /\n\s*---\s*\n/;
const joinExamples = (examples: Project['examples']) => examples.map((e) => e.text).join('\n---\n');
const splitExamples = (text: string) =>
  text
    .split(SPLIT)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({ text: t.slice(0, 1000) }));

export function emptyProject(): ProjectInput {
  return { name: '', description: '', platform: 'x', handle: '', audience: '', examples: [], personas: 12, rounds: 10 };
}

/** Field-level messages from a 400 response, keyed by field name. */
function fieldErrors(error: unknown): Record<string, string> {
  if (!isApiError(error, 'VALIDATION_FAILED')) return {};
  const fields = (error.details?.fields ?? []) as { path: string; message: string }[];
  return Object.fromEntries(fields.map((f) => [f.path.split('.')[0], f.message]));
}

/**
 * Everything that shapes a project's crowd. Used to create a project and to edit one; the caller owns
 * the submit button so the form fits a dialog or a page.
 */
export function ProjectForm({ id, initial, error, onSubmit, footer }: { id: string; initial: ProjectInput; error: unknown; onSubmit: (input: ProjectInput) => void; footer: ReactNode }) {
  const config = useAppConfig();
  const [v, setV] = useState({ ...initial, audience: initial.audience ?? '', examplesText: joinExamples(initial.examples ?? []) });
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV((prev) => ({ ...prev, [k]: value }));
  const errors = fieldErrors(error);
  const examples = splitExamples(v.examplesText);
  const limits = config.data?.limits;

  return (
    <form
      id={id}
      onSubmit={(e) => {
        e.preventDefault();
        const { examplesText, ...rest } = v;
        onSubmit({ ...rest, audience: v.audience.trim() || null, examples: splitExamples(examplesText) });
      }}
    >
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${id}-name`}>Project name</FieldLabel>
            <Input id={`${id}-name`} required maxLength={80} value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="Weekly newsletter" aria-invalid={Boolean(errors.name) || undefined} />
            {errors.name && <FieldError>{errors.name}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-handle`}>How you appear</FieldLabel>
            <Input id={`${id}-handle`} required maxLength={60} value={v.handle} onChange={(e) => set('handle', e.target.value)} placeholder="@kaifi" aria-invalid={Boolean(errors.handle) || undefined} />
            {errors.handle && <FieldError>{errors.handle}</FieldError>}
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor={`${id}-platform`}>Where you post</FieldLabel>
          <Select value={v.platform} onValueChange={(p) => set('platform', p as ProjectInput['platform'])}>
            <SelectTrigger id={`${id}-platform`} className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(config.data?.platforms ?? [{ id: 'x', name: 'X', reply_chars: 280 }]).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.id === 'generic' ? 'Anywhere else' : p.name} <span className="text-muted-foreground">· replies up to {p.reply_chars} characters</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-audience`}>Who reads you</FieldLabel>
          <Textarea
            id={`${id}-audience`}
            rows={4}
            maxLength={2000}
            value={v.audience}
            onChange={(e) => set('audience', e.target.value)}
            placeholder={'Founders: early-stage, short on time, allergic to hype\nEngineers: want specifics and sources\nNew followers: found you through a repost'}
          />
          <FieldDescription>One group per line, as "Name: who they are". Leave empty for a general crowd of peers, skeptics and newcomers.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-examples`}>Your past posts</FieldLabel>
          <Textarea id={`${id}-examples`} rows={5} value={v.examplesText} onChange={(e) => set('examplesText', e.target.value)} placeholder={'Paste a few posts that did well, or did badly.\n---\nPut a line with three dashes between posts.'} aria-invalid={Boolean(errors.examples) || undefined} />
          <FieldDescription>
            {examples.length ? `${examples.length} of 25 posts.` : 'Optional, up to 25.'} The crowd is cast from people who would follow someone who writes like this.
          </FieldDescription>
          {errors.examples && <FieldError>{errors.examples}</FieldError>}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${id}-personas`}>Followers per rehearsal</FieldLabel>
            <Input id={`${id}-personas`} type="number" min={2} max={limits?.maxPersonas ?? 30} value={v.personas} onChange={(e) => set('personas', Number(e.target.value))} />
            <FieldDescription>2 to 30. More followers, more model calls.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-rounds`}>Rounds</FieldLabel>
            <Input id={`${id}-rounds`} type="number" min={1} max={limits?.maxRounds ?? 40} value={v.rounds} onChange={(e) => set('rounds', Number(e.target.value))} />
            <FieldDescription>1 to 40. Each round, some followers scroll and act.</FieldDescription>
          </Field>
        </div>
        {error && !Object.keys(errors).length ? <FieldError>{(error as Error).message}</FieldError> : null}
        {footer}
      </FieldGroup>
    </form>
  );
}
