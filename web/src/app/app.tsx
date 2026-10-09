import { useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect } from 'react';
import { toast } from 'sonner';
import { whenSignedOut } from '@/api/client';
import { errorMessage } from '@/api/errors';
import { queryKeys } from '@/api/query-client';
import type { AuthSession } from '@/api/types';
import { Pip } from '@/components/brand/pip';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { useSession } from '@/features/auth/api';
import { AuthPage } from '@/features/auth/auth-page';
import { LandingPage } from '@/features/landing/landing-page';
import { navigate, useRoute, type Route } from './router';

// The landing and log-in pages ship in the main bundle; the signed-in screens load on first visit.
const ProjectsPage = lazy(() => import('@/features/projects/projects-page').then((m) => ({ default: m.ProjectsPage })));
const ProjectPage = lazy(() => import('@/features/projects/project-page').then((m) => ({ default: m.ProjectPage })));
const ComposePage = lazy(() => import('@/features/rehearsals/compose-page').then((m) => ({ default: m.ComposePage })));
const RehearsalPage = lazy(() => import('@/features/rehearsals/rehearsal-page').then((m) => ({ default: m.RehearsalPage })));
const AdvicePage = lazy(() => import('@/features/advice/advice-page').then((m) => ({ default: m.AdvicePage })));
const AccountPage = lazy(() => import('@/features/account/account-page').then((m) => ({ default: m.AccountPage })));

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'project':
      return <ProjectPage id={route.id} tab={route.tab} key={route.id} />;
    case 'compose':
      return <ComposePage id={route.id} from={route.from} key={`${route.id}/${route.from ?? ''}`} />;
    case 'rehearsal':
      return <RehearsalPage id={route.id} rid={route.rid} key={route.rid} />;
    case 'advice':
      return <AdvicePage id={route.id} aid={route.aid} key={route.aid} />;
    case 'account':
      return <AccountPage />;
    default:
      return <ProjectsPage />;
  }
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">{children}</div>;
}

/** Public pages for everyone; the app for a signed-in user; the log-in page for anyone else who asks for the app. */
export function App() {
  const route = useRoute();
  const session = useSession();
  const client = useQueryClient();
  const user = session.data?.user;

  // the session ended under us (expired, or the password changed on another device)
  useEffect(
    () =>
      whenSignedOut(() => {
        const current = client.getQueryData<AuthSession>(queryKeys.session);
        if (!current?.user) return;
        client.removeQueries({ predicate: (q) => q.queryKey[0] !== queryKeys.session[0] });
        client.setQueryData<AuthSession>(queryKeys.session, { ...current, user: null });
        toast.info('You were logged out. Log in again to carry on.');
      }),
    [client],
  );

  // signing in from the log-in page lands on the projects
  useEffect(() => {
    if (user && (route.name === 'login' || route.name === 'signup')) navigate({ name: 'projects' }, { replace: true });
  }, [user, route.name]);

  if (route.name === 'landing') return <LandingPage />;
  if (session.isPending) {
    return (
      <Centered>
        <Pip variant="sleepy" className="size-24" />
        <p className="text-sm text-muted-foreground">Waking the crowd</p>
      </Centered>
    );
  }
  if (session.isError) {
    return (
      <Centered>
        <Pip variant="oops" className="size-24" />
        <p className="text-sm text-body">{errorMessage(session.error)}</p>
        <Button variant="outline" onClick={() => void session.refetch()}>
          Try again
        </Button>
      </Centered>
    );
  }
  if (!user) return <AuthPage session={session.data} mode={route.name === 'signup' ? 'signup' : 'login'} />;
  if (route.name === 'login' || route.name === 'signup') return null;

  return (
    <AppShell route={route}>
      <Suspense fallback={null}>
        <Screen route={route} />
      </Suspense>
    </AppShell>
  );
}
