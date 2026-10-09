import type { ReactNode } from 'react';
import { Pip, type PipVariant } from '@/components/brand/pip';

/** An empty screen is an invitation to act: say what goes here and offer the action. */
export function EmptyState({ pip = 'plain', title, description, action }: { pip?: PipVariant; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed bg-card px-6 py-14 text-center">
      <Pip variant={pip} className="size-28" tilt={-4} />
      <div className="space-y-1.5">
        <h2 className="text-xl">{title}</h2>
        <p className="mx-auto max-w-[46ch] text-sm text-body">{description}</p>
      </div>
      {action}
    </div>
  );
}
