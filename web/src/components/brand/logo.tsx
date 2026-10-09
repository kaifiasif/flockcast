import { cn } from '@/lib/utils';

/**
 * The Flockcast mark: a coral speech bubble with three birds climbing across it, a flock taking off
 * from a post. Drawn in a 32x32 box; the birds grow and thicken as they rise so it reads at 16px.
 */
const BUBBLE = 'M16 2.5c7.7 0 13.5 5.3 13.5 12.3S23.7 27 16 27c-1.6 0-3.1-.2-4.5-.6L5.2 29.6c-.7.3-1.4-.4-1.1-1.1l1.9-4.6C3.7 21.7 2.5 18.4 2.5 14.8 2.5 7.8 8.3 2.5 16 2.5z';
const BIRDS: [string, number][] = [
  ['M8.10 18.40Q9.15 16.40 10.20 18.98Q11.25 16.40 12.30 18.40', 1.4],
  ['M13.00 13.40Q14.30 10.93 15.60 14.12Q16.90 10.93 18.20 13.40', 1.6],
  ['M18.50 9.40Q20.05 6.46 21.60 10.25Q23.15 6.46 24.70 9.40', 1.8],
];

export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('shrink-0', className)} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path d={BUBBLE} fill="var(--primary)" />
      <g fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
        {BIRDS.map(([d, w]) => (
          <path key={d} d={d} strokeWidth={w} />
        ))}
      </g>
    </svg>
  );
}

/** Mark and wordmark together. The wordmark is DM Sans bold, tight, in heading ink. */
export function Logo({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const mark = { sm: 'size-6', md: 'size-7', lg: 'size-10' }[size];
  const text = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' }[size];
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className={mark} />
      <span className={cn('font-display font-bold tracking-[-0.04em] text-foreground', text)}>Flockcast</span>
    </span>
  );
}
