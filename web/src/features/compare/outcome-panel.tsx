import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/errors';
import type { Outcome, Rehearsal } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { formatDate, formatPercent } from '@/lib/format';
import { useClearOutcome, useRecordOutcome } from './api';

const KINDS = [
  ['likes', 'Likes', 'like'],
  ['reposts', 'Reposts', 'repost'],
  ['replies', 'Replies', 'reply'],
  ['quotes', 'Quotes', 'quote'],
] as const;
type Kind = (typeof KINDS)[number][0];

const shares = (c: Record<Kind, number>) => {
  const total = KINDS.reduce((n, [k]) => n + c[k], 0);
  return total ? (Object.fromEntries(KINDS.map(([k]) => [k, c[k] / total])) as Record<Kind, number>) : null;
};

/** Mirrors mixMatch in engine/calibration.ts. */
function matchOf(sim: Record<Kind, number>, real: Record<Kind, number>) {
  const a = shares(sim);
  const b = shares(real);
  return a && b ? 1 - KINDS.reduce((n, [k]) => n + Math.abs(a[k] - b[k]), 0) / 2 : null;
}

const spelled = (c: Record<Kind, number>) => KINDS.map(([k, name, one]) => (c[k] === 1 ? `1 ${one}` : `${c[k]} ${name.toLowerCase()}`)).join(', ');

function Mix({ label, counts }: { label: string; counts: Record<Kind, number> }) {
  const s = shares(counts);
  return (
    <div>
      <p className="label-mono">{label}</p>
      <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${label}: ${spelled(counts)}`}>
        {s && KINDS.map(([k], i) => <span key={k} style={{ width: `${s[k] * 100}%`, opacity: 1 - i * 0.22 }} className="bg-primary" />)}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{spelled(counts)}</p>
    </div>
  );
}

function OutcomeForm({ r, projectId, onDone }: { r: Rehearsal; projectId: string; onDone: () => void }) {
  const save = useRecordOutcome(projectId, r.id);
  const o = r.outcome;
  const [v, setV] = useState({ likes: o?.likes ?? '', reposts: o?.reposts ?? '', replies: o?.replies ?? '', quotes: o?.quotes ?? '', impressions: o?.impressions ?? '', note: o?.note ?? '' });
  const num = (x: number | string) => (x === '' ? 0 : Number(x));
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(
          { likes: num(v.likes), reposts: num(v.reposts), replies: num(v.replies), quotes: num(v.quotes), impressions: v.impressions === '' ? null : Number(v.impressions), note: v.note },
          { onSuccess: () => (toast.success('Real results saved'), onDone()) },
        );
      }}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[...KINDS, ['impressions', 'Views', 'view'] as const].map(([k, name]) => (
          <Field key={k}>
            <FieldLabel htmlFor={`outcome-${k}`}>{name}</FieldLabel>
            <Input id={`outcome-${k}`} type="number" min={0} inputMode="numeric" value={v[k]} placeholder={k === 'impressions' ? 'Optional' : '0'} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
          </Field>
        ))}
      </div>
      <Field>
        <FieldLabel htmlFor="outcome-note">Note</FieldLabel>
        <Input id="outcome-note" maxLength={500} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="Optional, like when you posted or what you changed" />
      </Field>
      {save.error && <FieldError>{errorMessage(save.error)}</FieldError>}
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Spinner />}
          Save real results
        </Button>
        {o && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/** After posting: the author enters what really happened and sees how the rehearsal's reaction mix compares. */
export function OutcomePanel({ r, projectId }: { r: Rehearsal; projectId: string }) {
  const [editing, setEditing] = useState(false);
  const clear = useClearOutcome(projectId, r.id);
  const x = r.result!;
  const o: Outcome | null = r.outcome;
  const sim = { likes: x.counts.likes, reposts: x.counts.reposts, replies: x.counts.replies, quotes: x.counts.quotes };
  const match = o ? matchOf(sim, o) : null;
  return (
    <section className="rounded-3xl border bg-card p-6 md:p-8">
      <h2 className="text-xl">After you post</h2>
      {!o || editing ? (
        <>
          <p className="mt-1 mb-5 text-sm text-body">Published this? Enter the real numbers after a day or two. Flockcast compares how reactions split, not how many there were, and keeps score across your rehearsals.</p>
          <OutcomeForm r={r} projectId={projectId} onDone={() => setEditing(false)} />
        </>
      ) : (
        <div className="mt-4 grid gap-5">
          <p className="text-[15px] text-foreground">
            {match === null ? 'Add at least one reaction on each side to compare.' : <>The reactions split <strong>{formatPercent(match)}</strong> the same way as in the rehearsal.</>} <span className="text-muted-foreground">Recorded {formatDate(o.recorded_at)}{o.impressions != null && `, ${o.impressions.toLocaleString()} views`}{o.note && `. ${o.note}`}</span>
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Mix label="Rehearsal" counts={sim} />
            <Mix label="Real" counts={o} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit real results
            </Button>
            <Button variant="ghost" disabled={clear.isPending} onClick={() => clear.mutate(undefined, { onError: (e) => toast.error(errorMessage(e)) })}>
              Remove
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
