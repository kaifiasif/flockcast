import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/features/auth/api';
import { cn } from '@/lib/utils';

const FEATURE: Record<string, string> = {
  quick: 'Quick read',
  interviews: 'Ask followers questions',
  compare: 'Compare drafts',
  calibration: 'Real results and accuracy',
  advisor: 'Launch advisor',
  api: 'API keys',
  members: 'Team members and roles',
  approvals: 'Approvals',
  export: 'Export',
  webhooks: 'Webhooks',
  brand: 'Brand rules',
  audit: 'Audit log',
  research: 'Focus groups, message tests, crisis rehearsals',
};

/** The four plans side by side, with the account's own marked. One suite: plans only switch features on. */
export function PlanCard() {
  const mine = useSession().data?.user?.plan;
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => unwrap(api.plans.$get()), staleTime: 5 * 60_000 }).data;
  if (!plans) return null;
  const current = plans.enabled ? mine : 'enterprise';
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Plans</CardTitle>
        <CardDescription>
          {plans.enabled ? 'Every plan is the same app; a bigger plan switches more of it on.' : 'This server runs with plans off, so every feature is on for everyone.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {plans.plans.map((p) => (
            <li key={p.id} className={cn('flex flex-col gap-2 rounded-2xl border bg-background p-4', p.id === current && 'border-primary ring-2 ring-primary/20')}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-display text-lg font-bold text-foreground">{p.name}</p>
                {p.id === current && <span className="rounded-full bg-primary px-2 py-px text-xs font-medium text-primary-foreground">{plans.enabled ? 'Your plan' : 'Active'}</span>}
              </div>
              <p className="text-sm text-foreground">{p.price}</p>
              <p className="text-xs text-muted-foreground">{p.who}</p>
              <ul className="mt-1 space-y-1 text-sm text-body">
                <li>{p.limits.rehearsalsPerMonth === null ? 'Unlimited rehearsals' : `${p.limits.rehearsalsPerMonth} rehearsals a month`}</li>
                <li>Crowds up to {p.limits.maxPersonas}</li>
                {p.features.map((f) => (
                  <li key={f}>{FEATURE[f] ?? f}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
