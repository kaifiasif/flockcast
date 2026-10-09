import { InfoIcon } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '@/api/errors';
import type { Project, Rehearsal, RehearsalInput } from '@/api/types';
import { hrefOf, navigate } from '@/app/router';
import { Pip } from '@/components/brand/pip';
import { Page, PageHeader } from '@/components/shared/page';
import { QueryView } from '@/components/shared/query-view';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useAppConfig, useProject } from '@/features/projects/api';
import { takeDraft } from '@/lib/draft-handoff';
import { BackTo } from '@/features/projects/project-page';
import { useRehearsal, useStartRehearsal } from './api';

const SPLIT = /\n\s*---\s*\n/;

function Composer({ project, from }: { project: Project; from?: Rehearsal }) {
  const config = useAppConfig();
  const start = useStartRehearsal(project.id);
  // "Edit and run again" starts from an earlier rehearsal's text and settings
  const [text, setText] = useState(() => from?.posts.join('\n---\n') ?? takeDraft());
  const [title, setTitle] = useState(from?.title ?? '');
  const [platform, setPlatform] = useState(from?.settings.platform ?? project.platform);
  const [personas, setPersonas] = useState(from?.settings.personas ?? project.personas);
  const [rounds, setRounds] = useState(from?.settings.rounds ?? project.rounds);
  const [audience, setAudience] = useState(from && from.settings.audience !== project.audience ? (from.settings.audience ?? '') : '');
  const parts = text.split(SPLIT).filter((p) => p.trim()).length;
  const engine = config.data?.engine;
  const offline = engine?.kind === 'swarm-offline' || (engine?.kind === 'swarm' && !engine.model);

  const submit = (force = false) => {
    const input: RehearsalInput = { text, platform: platform as RehearsalInput['platform'], personas, rounds, force };
    if (title.trim()) input.title = title.trim();
    if (audience.trim()) input.audience = audience.trim();
    start.mutate(input, { onSuccess: (r) => navigate({ name: 'rehearsal', id: project.id, rid: r.id }) });
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
          <Field>
            <FieldLabel htmlFor="draft" className="text-base">
              Your draft
            </FieldLabel>
            <Textarea
              id="draft"
              required
              autoFocus
              rows={9}
              maxLength={config.data?.limits.maxTextChars ?? 10_000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-56 text-[17px] leading-relaxed"
              placeholder={'Paste the post exactly as you would publish it.\n\nFor a thread, put a line with three dashes between the parts:\n---\nLike this.'}
            />
            <FieldDescription>
              {text.trim() ? `${parts === 1 ? 'One post' : `A thread of ${parts} parts`}, ${text.length.toLocaleString()} characters. ` : ''}It is posted to the crowd word for word.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="title">Name for this rehearsal</FieldLabel>
            <Input id="title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional. The first line is used if empty." />
          </Field>
          <Collapsible>
            <CollapsibleTrigger className="rounded-full text-sm font-medium text-brand underline-offset-4 hover:underline">Change the crowd for this rehearsal only</CollapsibleTrigger>
            <CollapsibleContent className="mt-5 grid gap-5">
              <div className="grid gap-5 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="platform">Platform</FieldLabel>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger id="platform" className="h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(config.data?.platforms ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.id === 'generic' ? 'Anywhere else' : p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="personas">Followers</FieldLabel>
                  <Input id="personas" type="number" min={2} max={30} value={personas} onChange={(e) => setPersonas(Number(e.target.value))} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="rounds">Rounds</FieldLabel>
                  <Input id="rounds" type="number" min={1} max={40} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="audience">Audience</FieldLabel>
                <Textarea id="audience" rows={3} maxLength={2000} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder={project.audience ?? 'Investors: want traction numbers\nCustomers: want to know what changes for them'} />
                <FieldDescription>Leave empty to use the project's crowd.</FieldDescription>
              </Field>
            </CollapsibleContent>
          </Collapsible>
          {start.error && <FieldError>{errorMessage(start.error)}</FieldError>}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button type="submit" size="lg" disabled={start.isPending || !text.trim()}>
              {start.isPending && <Spinner />}
              Start rehearsal
            </Button>
            <span className="text-sm text-muted-foreground">
              {personas} followers, {rounds} rounds
            </span>
          </div>
        </FieldGroup>
      </form>

      <aside className="flex h-fit flex-col gap-4">
        <div className="rounded-3xl border bg-band p-6">
          <Pip variant="caster" className="-mt-2 -ml-2 size-20" />
          <h2 className="mt-2 text-lg">What happens next</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-body">
            <li>Flockcast casts {personas} followers from your audience notes and past posts.</li>
            <li>Your draft lands in their feeds. Over {rounds} rounds they like, repost, quote and reply.</li>
            <li>You get the replies, a report, and a pushback score for each sentence.</li>
          </ol>
        </div>
        {offline && (
          <Alert>
            <InfoIcon />
            <AlertTitle>Running without a model</AlertTitle>
            <AlertDescription>
              <p>This server has no model key, so rehearsals are an offline estimate and you cannot ask followers questions. Add a free Groq or Gemini key to get real replies.</p>
            </AlertDescription>
          </Alert>
        )}
      </aside>
    </div>
  );
}

function FromRehearsal({ project, rid }: { project: Project; rid: string }) {
  const from = useRehearsal(project.id, rid);
  return (
    <QueryView query={from} loading={<Skeleton className="h-96 rounded-3xl" />}>
      {(r) => <Composer project={project} from={r} />}
    </QueryView>
  );
}

export function ComposePage({ id, from }: { id: string; from?: string }) {
  const project = useProject(id);
  return (
    <Page>
      <QueryView query={project} loading={<Skeleton className="h-96 rounded-3xl" />}>
        {(p) => (
          <>
            <PageHeader back={<BackTo href={hrefOf({ name: 'project', id, tab: 'rehearsals' })}>{p.name}</BackTo>} title="Rehearse a post" description={`Paste a draft and ${p.handle}'s crowd will read it before anyone real does.`} />
            {from ? <FromRehearsal project={p} rid={from} /> : <Composer project={p} />}
          </>
        )}
      </QueryView>
    </Page>
  );
}
