import type { AuthSession } from '@/api/types';
import { hrefOf, navigate } from '@/app/router';
import { Logo } from '@/components/brand/logo';
import { Pip } from '@/components/brand/pip';
import { LoginForm } from './components/login-form';
import { SignupForm } from './components/signup-form';

type Mode = 'login' | 'signup';

function intro(mode: Mode, session: AuthSession) {
  if (mode === 'login') return { title: 'Welcome back', description: 'Log in to your projects and rehearsals.' };
  if (session.first_account) return { title: 'Set up Flockcast', description: 'This is the first account on this server, so it becomes the owner. New sign-ups stay closed unless you open them.' };
  return { title: 'Create your account', description: 'Your projects, rehearsals and keys are visible only to you.' };
}

/**
 * Log in and sign up. The form sits on the left; on wide screens the right half is a sticker pile of
 * the crowd with one reply, so the page says what the product is about without another paragraph.
 */
export function AuthPage({ session, mode }: { session: AuthSession; mode: Mode }) {
  // sign-up is only offered when the server takes new accounts
  const effective: Mode = mode === 'signup' && !session.signup_open ? 'login' : session.first_account ? 'signup' : mode;
  const { title, description } = intro(effective, session);

  return (
    <main className="grid min-h-svh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="flex flex-col p-6 md:p-10">
        <a href={hrefOf({ name: 'landing' })} aria-label="Flockcast home" className="w-fit">
          <Logo />
        </a>
        <div className="flex flex-1 items-center justify-center py-10">
          <div key={effective} className="flex w-full max-w-[380px] flex-col gap-7">
            <div className="flex flex-col gap-2">
              <h1 className="text-4xl">{title}</h1>
              <p className="text-[15px] text-body">{description}</p>
            </div>
            {effective === 'login' ? (
              <LoginForm onSignUp={session.signup_open ? () => navigate({ name: 'signup' }) : undefined} />
            ) : (
              <SignupForm onLogIn={session.first_account ? undefined : () => navigate({ name: 'login' })} />
            )}
            {!session.signup_open && effective === 'login' && <p className="text-sm text-muted-foreground">New accounts are turned off on this server. Ask its owner for access.</p>}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Sessions use a secure, HttpOnly cookie. Turn on 2-step codes in your account once you are in.</p>
      </div>

      <aside aria-hidden className="relative hidden overflow-hidden border-l bg-band lg:block">
        <div className="absolute inset-0 grid place-items-center p-12">
          <div className="relative h-[460px] w-[460px]">
            <Pip variant="fan" className="absolute top-2 left-6 size-40" tilt={-10} />
            <Pip variant="skeptic" className="absolute top-0 right-4 size-44" tilt={8} />
            <Pip variant="newcomer" className="absolute top-40 left-36 size-48" tilt={-3} />
            <Pip variant="analyst" className="absolute bottom-0 left-0 size-40" tilt={6} />
            <Pip variant="listener" className="absolute right-0 bottom-6 size-40" tilt={-8} />
            <div className="absolute -bottom-20 left-1/2 w-[340px] -translate-x-1/2 rounded-3xl rounded-tl-md border bg-card px-5 py-4 text-[15px] text-body shadow-[0_20px_50px_-30px_rgb(28_25_23/0.4)]">
              <span className="font-semibold text-foreground">Maya</span> <span className="text-muted-foreground">Data people</span>
              <p className="mt-1">Love the tip. Where is the 40% from, though?</p>
            </div>
          </div>
        </div>
      </aside>
    </main>
  );
}
