import type { RehearsalResult } from '@/api/types';
import { cn } from '@/lib/utils';
import { ResearchByline } from './crew';

/** Ivy's check of a rehearsed draft against the project's brand rules. */
export function BrandNotes({ x }: { x: RehearsalResult }) {
  const b = x.brand;
  if (!b) return null;
  return (
    <section className="space-y-4 rounded-3xl border bg-card p-6">
      <ResearchByline agent="ivy">{b.ok ? 'This draft keeps to your brand rules.' : 'This draft breaks your brand rules.'}</ResearchByline>
      {b.voice && <p className="text-sm text-body">{b.voice.fits ? 'Sounds like your brand.' : 'Does not sound like your brand.'} {b.voice.why}</p>}
      {b.issues.length > 0 && (
        <ul className="space-y-3">
          {b.issues.map((i, n) => (
            <li key={n} className="flex gap-3 text-sm">
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', i.level === 'risk' ? 'bg-primary' : 'bg-muted-foreground/50')} aria-hidden />
              <div>
                <p className="font-medium text-foreground">
                  {i.rule}
                  <span className="sr-only">{i.level === 'risk' ? ' (must fix)' : ' (check)'}</span>
                </p>
                <p className="text-body">{i.detail}</p>
                {i.excerpt && <p className="mt-1 text-muted-foreground">“{i.excerpt}”</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
