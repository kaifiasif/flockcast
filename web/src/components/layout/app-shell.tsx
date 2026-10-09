import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/errors';
import { hrefOf, type Route } from '@/app/router';
import { Logo } from '@/components/brand/logo';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useLogout, useSession } from '@/features/auth/api';
import { cn } from '@/lib/utils';

function NavLink({ to, active, children }: { to: Route; active: boolean; children: ReactNode }) {
  return (
    <a href={hrefOf(to)} aria-current={active ? 'page' : undefined} className={cn('rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors', active ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-body hover:text-foreground')}>
      {children}
    </a>
  );
}

/** Signed-in chrome: a quiet top bar with the logo, two places to go, and the account menu. */
export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const user = useSession().data?.user;
  const logout = useLogout();
  const inProjects = route.name !== 'account';

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <a href={hrefOf({ name: 'projects' })} aria-label="Flockcast projects" className="rounded-full">
            <Logo size="sm" />
          </a>
          <nav aria-label="Main" className="flex items-center gap-1">
            <NavLink to={{ name: 'projects' }} active={inProjects}>
              Projects
            </NavLink>
            <NavLink to={{ name: 'account' }} active={!inProjects}>
              Account
            </NavLink>
            <DropdownMenu>
              <DropdownMenuTrigger className="ml-2 rounded-full focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none" aria-label="Account menu">
                <Avatar className="size-8 ring-1 ring-border">
                  <AvatarFallback className="bg-brand-soft font-display text-sm font-bold text-brand">{user?.email.slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{user?.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href={hrefOf({ name: 'landing' })}>Flockcast home</a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={hrefOf({ name: 'account' })}>Password and 2-step codes</a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => logout.mutate(undefined, { onError: (e) => toast.error(errorMessage(e)) })}>Log out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
