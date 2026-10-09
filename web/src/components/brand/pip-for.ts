import type { PipVariant } from './pip-art';

/** Which sticker stands for a simulated follower: their stance first, then a stable pick by id for variety. */
export function pipFor(persona: { id: number; stance?: string | null }): PipVariant {
  if (persona.stance === 'skeptical') return persona.id % 2 ? 'skeptic' : 'analyst';
  if (persona.stance === 'supportive') return persona.id % 2 ? 'fan' : 'caster';
  return persona.id % 2 ? 'newcomer' : 'listener';
}
