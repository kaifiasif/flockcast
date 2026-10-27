import { PlusIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export interface SegmentDraft {
  name: string;
  about: string;
}

/** Groups people often can't reach for real feedback; a click fills one row. */
const SUGGESTED: SegmentDraft[] = [
  { name: 'Enterprise buyers', about: 'IT and procurement leads who ask about risk and price' },
  { name: 'Gen Z', about: 'Under 25, quick to spot anything that sounds like an ad' },
  { name: 'Investors', about: 'Want traction and a reason to care now' },
  { name: 'Developers', about: 'Allergic to hype, want specifics' },
  { name: 'Journalists', about: 'Looking for the story and the weak claim' },
  { name: 'Regulated industries', about: 'Health and finance staff who check every claim' },
];

export function SegmentsField({ id, value, onChange, max }: { id: string; value: SegmentDraft[]; onChange: (v: SegmentDraft[]) => void; max: number }) {
  const set = (i: number, patch: Partial<SegmentDraft>) => onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const unused = SUGGESTED.filter((s) => !value.some((v) => v.name.trim().toLowerCase() === s.name.toLowerCase()));
  return (
    <Field>
      <FieldLabel id={`${id}-label`}>Groups of people</FieldLabel>
      <ul className="grid gap-2" aria-labelledby={`${id}-label`}>
        {value.map((s, i) => (
          <li key={i} className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]">
            <Input aria-label={`Group ${i + 1} name`} maxLength={40} value={s.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Who" />
            <Input aria-label={`Group ${i + 1} description`} maxLength={300} value={s.about} onChange={(e) => set(i, { about: e.target.value })} placeholder="What they care about (optional)" />
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove group ${i + 1}`} disabled={value.length === 1} onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <XIcon />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {value.length < max && (
          <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, { name: '', about: '' }])}>
            <PlusIcon /> Add a group
          </Button>
        )}
        {value.length < max &&
          unused.slice(0, 4).map((s) => (
            <Button key={s.name} type="button" variant="ghost" size="sm" className="text-body" onClick={() => onChange([...value.filter((v) => v.name.trim()), s])}>
              {s.name}
            </Button>
          ))}
      </div>
      <FieldDescription>Up to {max} groups. Each gets its own simulated people, so you can see where groups disagree.</FieldDescription>
    </Field>
  );
}

export const cleanSegments = (v: SegmentDraft[]) => v.map((s) => ({ name: s.name.trim(), about: s.about.trim() })).filter((s) => s.name);
