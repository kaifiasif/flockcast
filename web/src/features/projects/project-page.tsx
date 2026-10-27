import { ChevronLeftIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { hrefOf, type ProjectTab } from '@/app/router';
import { Page, PageHeader } from '@/components/shared/page';
import { QueryView } from '@/components/shared/query-view';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AdvisorPanel } from '@/features/advice/advisor-panel';
import { ResearchPanel } from '@/features/research/research-panel';
import { RehearsalList } from '@/features/rehearsals/rehearsal-list';
import { cn } from '@/lib/utils';
import { useAppConfig, useProject } from './api';
import { KeysPanel } from './components/keys-panel';
import { SetupPanel } from './components/setup-panel';
import { useSession } from '@/features/auth/api';
import { AuditPanel } from '@/features/team/audit-panel';
import { ROLE, TeamPanel } from '@/features/team/team-panel';
import { WebhooksPanel } from '@/features/team/webhooks-panel';

const TABS: { tab: ProjectTab; label: string; owner?: boolean }[] = [
  { tab: 'rehearsals', label: 'Rehearsals' },
  { tab: 'advisor', label: 'Launch advisor' },
  { tab: 'research', label: 'Research' },
  { tab: 'team', label: 'Team' },
  { tab: 'setup', label: 'Crowd and setup', owner: true },
  { tab: 'keys', label: 'API and webhooks', owner: true },
  { tab: 'audit', label: 'Usage and audit', owner: true },
];

export function BackTo({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="inline-flex w-fit items-center gap-1 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground">
      <ChevronLeftIcon className="size-4" /> {children}
    </a>
  );
}

export function ProjectPage({ id, tab }: { id: string; tab: ProjectTab }) {
  const project = useProject(id);
  const config = useAppConfig();
  const me = useSession().data?.user?.id;

  return (
    <Page>
      <QueryView query={project} loading={<Skeleton className="h-24 rounded-3xl" />}>
        {(p) => {
          const platform = config.data?.platforms.find((x) => x.id === p.platform);
          return (
            <>
              <PageHeader
                back={<BackTo href={hrefOf({ name: 'projects' })}>Projects</BackTo>}
                title={p.name}
                description={
                  <>
                    {p.handle} on {p.platform === 'generic' ? 'any platform' : (platform?.name ?? p.platform)}. {p.personas} followers, {p.rounds} rounds per rehearsal.
                    {p.role !== 'owner' && ` You are ${ROLE[p.role].name.toLowerCase()} here.`}
                  </>
                }
                actions={
                  (p.role === 'owner' || p.role === 'editor') && (
                  <>
                    <Button variant="outline" asChild>
                      <a href={hrefOf({ name: 'compare', id })}>Compare drafts</a>
                    </Button>
                    <Button asChild>
                      <a href={hrefOf({ name: 'compose', id })}>Rehearse a post</a>
                    </Button>
                  </>
                  )
                }
              />
              <nav aria-label="Project sections" className="-mx-1 flex gap-1 overflow-x-auto px-1">
                {TABS.filter((t) => !t.owner || p.role === 'owner').map((t) => (
                  <a
                    key={t.tab}
                    href={hrefOf({ name: 'project', id, tab: t.tab })}
                    aria-current={t.tab === tab ? 'page' : undefined}
                    className={cn('shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors', t.tab === tab ? 'bg-foreground text-background' : 'text-body hover:bg-accent hover:text-foreground')}
                  >
                    {t.label}
                  </a>
                ))}
              </nav>
              {tab === 'rehearsals' && <RehearsalList project={p} />}
              {tab === 'advisor' && <AdvisorPanel project={p} />}
              {tab === 'research' && <ResearchPanel project={p} />}
              {tab === 'setup' && p.role === 'owner' && <SetupPanel project={p} />}
              {tab === 'keys' && p.role === 'owner' && (
                <div className="grid gap-10">
                  <KeysPanel project={p} />
                  <WebhooksPanel project={p} />
                </div>
              )}
              {tab === 'team' && <TeamPanel project={p} userId={me ?? ''} />}
              {tab === 'audit' && p.role === 'owner' && <AuditPanel project={p} />}
            </>
          );
        }}
      </QueryView>
    </Page>
  );
}
