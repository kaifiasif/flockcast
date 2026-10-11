import type { ReactNode } from 'react';
import { errorMessage } from '@/api/errors';
import type { StudyInput } from '@/api/types';
import { navigate } from '@/app/router';
import { Button } from '@/components/ui/button';
import { FieldError, FieldGroup } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { useStartStudy } from '../api';

/** The submit, error and redirect every study form shares. */
export function StudyFormShell({ projectId, build, ready, action, children }: { projectId: string; build: () => StudyInput; ready: boolean; action: string; children: ReactNode }) {
  const start = useStartStudy(projectId);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start.mutate(build(), { onSuccess: (s) => navigate({ name: 'study', id: projectId, sid: s.id }) });
      }}
    >
      <FieldGroup>
        {children}
        {start.error && <FieldError>{errorMessage(start.error)}</FieldError>}
        <div className="pt-1">
          <Button type="submit" size="lg" disabled={start.isPending || !ready}>
            {start.isPending && <Spinner />}
            {action}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
