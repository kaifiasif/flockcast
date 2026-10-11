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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAppConfig, useProject } from '@/features/projects/api';
import { takeDraft } from '@/lib/draft-handoff';
import { BackTo } from '@/features/projects/project-page';
import { useUsage } from '@/features/team/api';
import { useRehearsal, useStartRehearsal } from './api';

const SPLIT = /\n\s*---\s*\n/;

/** Crowds people find hard to reach for real feedback. Picking one fills the audience box. */
const PRESETS: { name: string; audience: string }[] = [
  { name: 'Enterprise buyers', audience: 'IT and security leads: ask about risk, data handling and who else uses it.\nProcurement: want pricing clarity and contracts.\nBusy executives: skim the first line and decide.' },
  { name: 'Investors', audience: 'Seed investors: want traction numbers and why now.\nAngel operators: judge the founder by clarity.\nSkeptical analysts: question market size claims.' },
  { name: 'Developers', audience: 'Senior engineers: allergic to hype, want specifics and benchmarks.\nOpen-source maintainers: care about licences and lock-in.\nJunior developers: want to know how to start.' },
  { name: 'Journalists', audience: 'Tech reporters: look for the news angle and a source.\nFact-checkers: question every number.\nEditors: ask why readers should care today.' },
  { name: 'Gen Z', audience: 'Students: spot cringe and corporate voice instantly.\nYoung creators: share what feels real and funny.\nLurkers: like quietly, rarely reply.' },
  { name: 'Regulated industries', audience: 'Compliance officers: flag claims that could mislead.\nClinicians or advisers: question advice without evidence.\nRisk-averse managers: want proof others did it safely.' },
];

function Composer({ project, from }: { project: Project; from?: Rehearsal }) {
  const config = useAppConfig();
  const start = useStartRehearsal(project.id);
  // "Edit and run again" starts from an earlier rehearsal's text and settings
  const [text, setText] = useState(() => from?.posts.join('\n---\n') ?? takeDraft());
  const [title, setTitle] = useState(from?.title ?? '');
  const [platform, setPlatform] = useState(from?.settings.platform ?? project.platform);
  const [personas, setPersonas] = useState(from?.settings.personas ?? project.personas);
  const crowdCap = useUsage(project.id).data?.plan.limits.maxPersonas ?? 30;
  const [rounds, setRounds] = useState(from?.settings.rounds ?? project.rounds);
  const [audience, setAudience] = useState(from && from.settings.audience !== project.audience ? (from.settings.audience ?? '') : '');
  const [mode, setMode] = useState<'crowd' | 'quick'>(from?.settings.mode ?? 'crowd');
  const [critic, setCritic] = useState(from?.settings.critic ?? true);
  const parts = text.split(SPLIT).filter((p) => p.trim()).length;
  const engine = config.data?.engine;
  const offline = engine?.kind === 'swarm-offline' || (engine?.kind === 'swarm' && !engine.model);
  // a quick read is one model call; without a model, or on MiroFish, only the full crowd runs
  const canQuick = !offline && (config.data?.studio.modes ?? []).includes('quick');
  const quick = canQuick && mode === 'quick';

  const submit = (force = false) => {
    const input: RehearsalInput = { text, platform: platform as RehearsalInput['platform'], personas, rounds, critic, mode: quick ? 'quick' : 'crowd', force };
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
                  <Input id="personas" type="number" min={2} max={crowdCap} value={personas} onChange={(e) => setPersonas(Number(e.target.value))} />
                  {crowdCap > 30 && <FieldDescription>Up to {crowdCap} on this plan.</FieldDescription>}
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
                  <FieldDescription>Rook the Contrarian joins the crowd and goes after your weakest claim, so a friendly crowd cannot hide it.</FieldDescription>
                </div>
              </Field>
              <div className="grid gap-2">
                <p className="text-sm font-medium text-foreground">Hard-to-reach crowds</p>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <Button key={p.name} type="button" variant={audience === p.audience ? 'default' : 'outline'} size="sm" aria-pressed={audience === p.audience} onClick={() => setAudience(audience === p.audience ? '' : p.audience)}>
                      {p.name}
                    </Button>
                  ))}
                </div>
              </div>
              <Field>
                <FieldLabel htmlFor="audience">Audience</FieldLabel>
                <Textarea id="audience" rows={3} maxLength={2000} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder={project.audience ?? 'Investors: want traction numbers\nCustomers: want to know what changes for them'} />
                <FieldDescription>Leave empty to use the project's crowd.</FieldDescription>
              </Field>
            </CollapsibleContent>
          </Collapsible>
          {canQuick && (
            <Field>
              <FieldLabel id="mode-label">How deep</FieldLabel>
              <ToggleGroup type="single" variant="outline" value={mode} onValueChange={(v) => v && setMode(v as 'crowd' | 'quick')} aria-labelledby="mode-label" className="w-full sm:w-fit">
                <ToggleGroupItem value="crowd" className="flex-1 px-4 sm:flex-none">
                  Full crowd
                </ToggleGroupItem>
                <ToggleGroupItem value="quick" className="flex-1 px-4 sm:flex-none">
                  Quick read
                </ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>{quick ? 'Wren reads it with your crowd in one pass. Fast, but nobody sees anyone else’s reply.' : 'Followers see each other’s replies over several rounds, so pile-ons show up.'}</FieldDescription>
            </Field>
          )}
          {start.error && <FieldError>{errorMessage(start.error)}</FieldError>}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button type="submit" size="lg" disabled={start.isPending || !text.trim()}>
              {start.isPending && <Spinner />}
              Start rehearsal
            </Button>
            <span className="text-sm text-muted-foreground">
              {quick ? `${personas} followers, one pass` : `${personas} followers, ${rounds} rounds`}
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
            <li>The studio crew flags lines that read as AI, suggests fixes, checks {platform === 'generic' ? 'the platform' : (config.data?.platforms.find((p) => p.id === platform)?.name ?? 'the platform')}'s rules and drafts answers to the first replies.</li>
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
