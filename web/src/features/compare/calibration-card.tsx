import { Pip } from '@/components/brand/pip';
import { formatPercent } from '@/lib/format';
import { useCalibration } from './api';

/** How close this project's rehearsals came to real results, once the author has entered some. */
export function CalibrationCard({ projectId }: { projectId: string }) {
  const cal = useCalibration(projectId).data;
  if (!cal?.count) return null;
  const won = cal.comparisons.filter((c) => c.agreed).length;
  return (
    <section className="mb-4 flex items-center gap-4 rounded-3xl border bg-band p-5" aria-label="How close rehearsals came">
      <Pip variant="analyst" className="size-14 shrink-0" />
      <div className="text-sm text-body">
        <p className="font-display text-lg font-bold text-foreground">
          {cal.average_match === null ? 'Real results recorded' : `${formatPercent(cal.average_match)} reaction match`}
        </p>
        <p>
          Across {cal.count} {cal.count === 1 ? 'post' : 'posts'} with real numbers, this is how closely the way reactions split matched the rehearsal.
          {cal.comparisons.length > 0 && ` In compared drafts, the crowd’s pick did best for real ${won} of ${cal.comparisons.length} times.`}
        </p>
      </div>
    </section>
  );
}
