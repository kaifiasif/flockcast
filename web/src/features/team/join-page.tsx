import { useEffect, useRef } from 'react';
import { errorMessage } from '@/api/errors';
import { hrefOf, navigate } from '@/app/router';
import { Pip } from '@/components/brand/pip';
import { Page } from '@/components/shared/page';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useAcceptInvite } from './api';

/** Opening an invite link joins the project at once and goes there. */
export function JoinPage({ token }: { token: string }) {
  const accept = useAcceptInvite();
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    accept.mutate(token, { onSuccess: (p) => navigate({ name: 'project', id: p.id, tab: 'rehearsals' }, { replace: true }) });
  }, [accept, token]);
  return (
    <Page>
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-3xl border bg-card px-6 py-14 text-center">
        <Pip variant={accept.isError ? 'oops' : 'newcomer'} className="size-24" />
        {accept.isError ? (
          <>
            <h1 className="text-2xl">This invite did not work</h1>
            <p className="text-sm text-body">{errorMessage(accept.error)}</p>
            <Button asChild>
              <a href={hrefOf({ name: 'projects' })}>Go to your projects</a>
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-2xl">Joining the project</h1>
            <Spinner />
          </>
        )}
      </div>
    </Page>
  );
}
