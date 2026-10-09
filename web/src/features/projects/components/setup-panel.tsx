import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/errors';
import type { Project } from '@/api/types';
import { navigate } from '@/app/router';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useDeleteProject, useUpdateProject } from '../api';
import { ProjectForm } from './project-form';

export function SetupPanel({ project }: { project: Project }) {
  const update = useUpdateProject(project.id);
  const remove = useDeleteProject(project.id);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="rounded-3xl border bg-card p-6 md:p-8">
        <h2 className="text-xl">Crowd and setup</h2>
        <p className="mt-1 mb-6 text-sm text-body">Changes apply to the next rehearsal. Past rehearsals keep the setup they ran with.</p>
        <ProjectForm
          key={project.updated_at}
          id="project-setup"
          initial={project}
          error={update.error}
          onSubmit={(input) => update.mutate(input, { onSuccess: () => toast.success('Setup saved') })}
          footer={
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={update.isPending}>
                {update.isPending && <Spinner />}
                Save setup
              </Button>
            </div>
          }
        />
      </section>
      <aside className="h-fit rounded-3xl border border-[#f1c9c4] bg-card p-6">
        <h2 className="text-lg">Delete this project</h2>
        <p className="mt-1 text-sm text-body">Removes its rehearsals and stops its API keys working. This cannot be undone.</p>
        <Button variant="outline" className="mt-4 text-destructive" onClick={() => setConfirming(true)}>
          Delete project
        </Button>
      </aside>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {project.name}?</AlertDialogTitle>
            <AlertDialogDescription>Its rehearsals are deleted and any app using its API keys stops working.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => {
                    toast.success('Project deleted');
                    navigate({ name: 'projects' }, { replace: true });
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
