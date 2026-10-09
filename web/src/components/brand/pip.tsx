import { useId } from 'react';
import { cn } from '@/lib/utils';
import { PIP_VARIANTS, PIP_VIEWBOX, pipMarkup, type PipVariant } from './pip-art';

/** Pip the mascot as a sticker. Decorative unless given a label. */
export function Pip({ variant = 'plain', className, label, tilt = 0 }: { variant?: PipVariant; className?: string; label?: string; tilt?: number }) {
  const id = `pip${useId().replace(/[^\w]/g, '')}`;
  return (
    <svg
      viewBox={PIP_VIEWBOX}
      className={cn('shrink-0 overflow-visible', className)}
      style={tilt ? { rotate: `${tilt}deg` } : undefined}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      // static art from pip-art.ts; nothing from users or the server reaches this markup
      dangerouslySetInnerHTML={{ __html: pipMarkup(id, variant) }}
    />
  );
}

export { PIP_VARIANTS, type PipVariant };
