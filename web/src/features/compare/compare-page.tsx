import { PlusIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '@/api/errors';
import type { CompareInput, Project } from '@/api/types';
import { hrefOf, navigate } from '@/app/router';
import { Pip } from '@/components/brand/pip';
import { Page, PageHeader } from '@/components/shared/page';
import { QueryView } from '@/components/shared/query-view';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAppConfig, useProject } from '@/features/projects/api';
import { BackTo } from '@/features/projects/project-page';
import { useStartComparison } from './api';

const LETTERS = ['A', 'B', 'C'];

function CompareForm({ project }: { project: Project }) {
  const config = useAppConfig();
  const start = useStartComparison(project.id);
  const [drafts, setDrafts] = useState(['', '']);
  const [personas, setPersonas] = useState(project.personas);
  const [rounds, setRounds] = useState(project.rounds);
  const [critic, setCritic] = useState(true);
  const max = config.data?.limits.maxTextChars ?? 10_000;
  const ready = drafts.every((d) => d.trim()) && new Set(drafts.map((d) => d.trim())).size === drafts.length;

  const submit = () => {
    const json: CompareInput = { drafts: drafts.map((text) => ({ text })), personas, rounds, critic };
    start.mutate(json, { onSuccess: (res) => navigate({ name: 'comparison', id: project.id, gid: res.group_id }) });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <form
        className="rounded-3xl border bg-card p-6 md:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <FieldGroup>
          {drafts.map((d, i) => (
            <Field key={i}>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor={`draft-${i}`} className="text-base">
                  Draft {LETTERS[i]}
                </FieldLabel>
                {drafts.length > 2 && (
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove draft ${LETTERS[i]}`} onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}>
                    <XIcon />
                  </Button>
                )}
              </div>
              <Textarea
                id={`draft-${i}`}
                required
                autoFocus={i === 0}
                rows={5}
                maxLength={max}
                value={d}
                onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? e.target.value : x)))}
                className="min-h-32 text-[16px] leading-relaxed"
                placeholder={i === 0 ? 'Your first version, exactly as you would post it.' : 'Another version: a different hook, a shorter cut, a softer claim.'}
              />
            </Field>
          ))}
          {drafts.length < 3 && (
            <Button type="button" variant="outline" className="w-fit" onClick={() => setDrafts([...drafts, ''])}>
              <PlusIcon />
              Add draft C
            </Button>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="personas">Followers</FieldLabel>
              <Input id="personas" type="number" min={2} max={30} value={personas} onChange={(e) => setPersonas(Number(e.target.value))} />
            </Field>
            <Field>
              <FieldLabel htmlFor="rounds">Rounds</FieldLabel>
              <Input id="rounds" type="number" min={1} max={40} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} />
            </Field>
          </div>
          <Field orientation="horizontal" className="items-start">
            <Switch id="critic" checked={critic} onCheckedChange={setCritic} />
            <div className="grid gap-1">
              <FieldLabel htmlFor="critic">Seat a harsh critic</FieldLabel>
              <FieldDescription>Rook the Contrarian reads every draft too.</FieldDescription>
            </div>
          </Field>
          {start.error && <FieldError>{errorMessage(start.error)}</FieldError>}
          {!ready && drafts.every((d) => d.trim()) && <FieldError>Each draft must be different.</FieldError>}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button type="submit" size="lg" disabled={start.isPending || !ready}>
              {start.isPending && <Spinner />}
              Compare {drafts.length} drafts
            </Button>
            <span className="text-sm text-muted-foreground">
              {personas} followers read each draft, {rounds} rounds
            </span>
          </div>
        </FieldGroup>
      </form>
      <aside className="h-fit rounded-3xl border bg-band p-6">
        <Pip variant="analyst" className="-mt-2 -ml-2 size-20" />
        <h2 className="mt-2 text-lg">One crowd, every draft</h2>
        <p className="mt-3 text-sm text-body">Draft A casts the crowd. The same people then read each other draft, with the same luck in who sees what, so the differences come from your words.</p>
        <p className="mt-3 text-sm text-body">It is still a rehearsal: use it to pick between versions, not to predict numbers.</p>
      </aside>
    </div>
  );
}

export function ComparePage({ id }: { id: string }) {
  const project = useProject(id);
  return (
    <Page>
      <QueryView query={project} loading={<Skeleton className="h-96 rounded-3xl" />}>
        {(p) => (
          <>
            <PageHeader back={<BackTo href={hrefOf({ name: 'project', id, tab: 'rehearsals' })}>{p.name}</BackTo>} title="Compare drafts" description={`Two or three versions of one post, read by the same simulated crowd.`} />
            <CompareForm project={p} />
          </>
        )}
      </QueryView>
    </Page>
  );
}
