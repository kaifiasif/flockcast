import type { Rehearsal } from '@/api/types';

export const STAGE: Record<Rehearsal['status'], string> = {
  queued: 'Waiting to start',
  preparing: 'Casting the crowd',
  running: 'The crowd is reading',
  reporting: 'Writing the report',
  done: 'Done',
  failed: 'Did not finish',
};

export function engineLabel(result: { engine: string; model: string | null } | null | undefined) {
  if (!result) return '';
  if (result.engine === 'swarm-offline') return 'Offline estimate';
  if (result.engine === 'mirofish') return 'MiroFish';
  return result.model ?? 'Model';
}
