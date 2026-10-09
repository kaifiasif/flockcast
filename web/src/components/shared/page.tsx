import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** The body of every signed-in screen: the 1280px container and the vertical rhythm. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn('container-page flex flex-1 flex-col gap-8 py-8 md:py-12', className)}>{children}</main>;
}

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-3xl md:text-4xl">{title}</h1>
          {description && <p className="max-w-[62ch] text-[15px] text-body">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
