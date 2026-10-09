import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { ProjectSummary } from '@/api/types';
import { hrefOf, navigate } from '@/app/router';
import { EmptyState } from '@/components/shared/empty-state';
import { Page, PageHeader } from '@/components/shared/page';
import { QueryView } from '@/components/shared/query-view';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { formatRelative, plural } from '@/lib/format';
import { useAppConfig, useCreateProject, useProjects } from './api';
import { emptyProject, ProjectForm } from './components/project-form';

function platformName(id: string, names: Record<string, string>) {
  return id === 'generic' ? 'Anywhere' : (names[id] ?? id);
}

function ProjectCard({ p, names }: { p: ProjectSummary; names: Record<string, string> }) {
  return (
    <a href={hrefOf({ name: 'project', id: p.id, tab: 'rehearsals' })} className="group flex flex-col rounded-3xl border bg-card p-6 transition-colors hover:border-[#d6d3d1] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-band px-2.5 py-0.5 text-xs font-medium text-foreground">{platformName(p.platform, names)}</span>
        <span className="truncate text-sm text-muted-foreground">{p.handle}</span>
      </div>
      <h2 className="mt-5 truncate text-2xl group-hover:text-brand">{p.name}</h2>
      <p className="mt-1.5 line-clamp-2 min-h-[2lh] text-sm text-body">{p.description || p.audience?.split('\n')[0] || 'A general crowd of peers, skeptics and newcomers.'}</p>
      <p className="mt-6 border-t pt-4 text-sm text-muted-foreground">
        {p.rehearsal_count ? `${plural(p.rehearsal_count, 'rehearsal')}, last ${formatRelative(p.last_rehearsal_at)}` : 'No rehearsals yet'}
      </p>
    </a>
  );
}

export function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useCreateProject();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-bold tracking-tight">New project</DialogTitle>
          <DialogDescription>A project is one place you post and the crowd that reads it. You can change all of this later.</DialogDescription>
        </DialogHeader>
        <ProjectForm
          id="new-project"
          initial={emptyProject()}
          error={create.error}
          onSubmit={(input) =>
            create.mutate(input, {
              onSuccess: (project) => {
                onOpenChange(false);
                toast.success('Project created');
                navigate({ name: 'compose', id: project.id });
              },
            })
          }
          footer={
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending && <Spinner />}
                Create project
              </Button>
            </div>
          }
        />
      </DialogContent>
    </Dialog>
  );
}

export function ProjectsPage() {
  const projects = useProjects();
  const config = useAppConfig();
  const [creating, setCreating] = useState(false);
  const names = Object.fromEntries((config.data?.platforms ?? []).map((p) => [p.id, p.name]));

  return (
    <Page>
      <PageHeader
        title="Projects"
        description="Each project keeps its own crowd, past posts, rehearsals and API keys."
        actions={
          <Button onClick={() => setCreating(true)}>
            <PlusIcon /> New project
          </Button>
        }
      />
      <QueryView
        query={projects}
        loading={
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-52 rounded-3xl" />
            ))}
          </div>
        }
      >
        {(list) =>
          list.length ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {list.map((p) => (
                <ProjectCard key={p.id} p={p} names={names} />
              ))}
            </div>
          ) : (
            <EmptyState
              pip="plain"
              title="Start your first project"
              description="Tell Flockcast where you post and who reads you. Then paste a draft and watch the crowd react."
              action={
                <Button onClick={() => setCreating(true)}>
                  <PlusIcon /> New project
                </Button>
              }
            />
          )
        }
      </QueryView>
      <NewProjectDialog open={creating} onOpenChange={setCreating} />
    </Page>
  );
}
