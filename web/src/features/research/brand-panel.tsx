import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/errors';
import type { Project } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useUsage } from '@/features/team/api';
import { useSaveBrand } from './api';
import { ResearchByline } from './crew';

const lines = (v: string, max: number) => v.split(/\n|,/).map((w) => w.trim()).filter(Boolean).slice(0, max);

/** The project's brand rules. Ivy checks every rehearsal and message test against them. */
export function BrandPanel({ project }: { project: Project }) {
  const usage = useUsage(project.id);
  const save = useSaveBrand(project.id);
  const b = project.brand;
  const [voice, setVoice] = useState(b?.voice ?? '');
  const [banned, setBanned] = useState((b?.banned ?? []).join('\n'));
  const [required, setRequired] = useState((b?.required ?? []).join('\n'));
  const [notes, setNotes] = useState(b?.notes ?? '');
  if (usage.data && !usage.data.plan.features.includes('brand')) {
    return (
      <section className="rounded-3xl border bg-card p-6 text-sm text-body">
        <ResearchByline agent="ivy" />
        <p className="mt-4">Brand rules are on the Studio plan and above. This project is on {usage.data.plan.name}.</p>
      </section>
    );
  }
  return (
    <form
      className="rounded-3xl border bg-card p-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ voice: voice.trim(), banned: lines(banned, 50), required: lines(required, 10), notes: notes.trim() }, { onSuccess: (r) => toast.success(r ? 'Brand rules saved' : 'Brand rules cleared') });
      }}
    >
      <ResearchByline agent="ivy" />
      <FieldGroup className="mt-6">
        <Field>
          <FieldLabel htmlFor="brand-voice">How the brand sounds</FieldLabel>
          <Textarea id="brand-voice" rows={3} maxLength={600} value={voice} onChange={(e) => setVoice(e.target.value)} placeholder="Calm, plain and warm. No hype, no exclamation marks." />
          <FieldDescription>Checked with a model when one is set.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="brand-banned">Never say</FieldLabel>
          <Textarea id="brand-banned" rows={3} value={banned} onChange={(e) => setBanned(e.target.value)} placeholder={'game-changer\nrevolutionary\nguaranteed'} />
          <FieldDescription>One per line. Matched as whole words.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="brand-required">Always include</FieldLabel>
          <Textarea id="brand-required" rows={2} value={required} onChange={(e) => setRequired(e.target.value)} placeholder="#ad" />
        </Field>
        <Field>
          <FieldLabel htmlFor="brand-notes">Other rules</FieldLabel>
          <Textarea id="brand-notes" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Never name competitors. Health claims need a source." />
        </Field>
        {save.error && <FieldError>{errorMessage(save.error)}</FieldError>}
        <div>
          <Button type="submit" variant="outline" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            Save brand rules
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
