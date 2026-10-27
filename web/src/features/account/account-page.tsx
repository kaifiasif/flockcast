import { Page, PageHeader } from '@/components/shared/page';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountCard } from '@/features/auth/components/account-card';
import { TwoStepCard } from '@/features/auth/components/two-step-card';
import { useAppConfig } from '@/features/projects/api';
import { PlanCard } from './plan-card';

const PROVIDERS: Record<string, string> = { groq: 'Groq', gemini: 'Google Gemini', openrouter: 'OpenRouter', ollama: 'Ollama on this machine', openai: 'OpenAI', custom: 'A custom endpoint', mirofish: 'MiroFish' };

function ServerCard() {
  const config = useAppConfig().data;
  if (!config) return null;
  const { engine, limits } = config;
  const offline = engine.kind === 'swarm-offline';
  return (
    <Card>
      <CardHeader>
        <CardTitle>This server</CardTitle>
        <CardDescription>Set by whoever runs Flockcast, in its environment. Keys are never shown here.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Crowd engine</dt>
          <dd>{offline ? 'Offline estimate, no model key set' : engine.kind === 'mirofish' ? 'MiroFish' : 'Flockcast swarm'}</dd>
          {!offline && (
            <>
              <dt className="text-muted-foreground">Model</dt>
              <dd className="truncate">
                {engine.model ?? 'Default'}
                {engine.provider && `, via ${PROVIDERS[engine.provider] ?? engine.provider}`}
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">Questions per rehearsal</dt>
          <dd>{engine.interviews ? limits.interviewsPerRehearsal : 'Off'}</dd>
          <dt className="text-muted-foreground">Reruns of one post</dt>
          <dd>{limits.rehearsalsPerSubjectPerDay} a day</dd>
          <dt className="text-muted-foreground">New accounts</dt>
          <dd>{config.signup === 'open' ? 'Open to anyone' : 'Closed'}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}

export function AccountPage() {
  return (
    <Page>
      <PageHeader title="Account" description="Your log-in, 2-step codes, and how this Flockcast server is set up." />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <AccountCard />
          <TwoStepCard />
        </div>
        <ServerCard />
        <PlanCard />
      </div>
    </Page>
  );
}
