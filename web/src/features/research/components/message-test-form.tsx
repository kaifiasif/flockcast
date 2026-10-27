import { PlusIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { StudyFormShell } from './form-shell';
import { cleanSegments, SegmentsField, type SegmentDraft } from './segments-field';

const LETTERS = 'ABCD';

export function MessageTestForm({ projectId, maxPanel }: { projectId: string; maxPanel: number }) {
  const [goal, setGoal] = useState('');
  const [messages, setMessages] = useState(['', '']);
  const [segments, setSegments] = useState<SegmentDraft[]>([{ name: 'Founders', about: '' }, { name: 'Enterprise buyers', about: 'IT and procurement leads who ask about risk and price' }]);
  const [per, setPer] = useState(5);
  const versions = messages.map((m) => m.trim()).filter(Boolean);
  const groups = cleanSegments(segments);
  const people = per * Math.max(groups.length, 1);
  return (
    <StudyFormShell
      projectId={projectId}
      action="Run the message test"
      ready={versions.length >= 2 && groups.length > 0 && people <= maxPanel}
      build={() => ({ kind: 'message_test', goal: goal.trim() || null, messages: versions.map((text, i) => ({ label: `Version ${LETTERS[i]}`, text })), segments: groups, per_segment: per })}
    >
      <Field>
        <FieldLabel htmlFor="mt-goal">What should the message do?</FieldLabel>
        <Input id="mt-goal" maxLength={300} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Optional, like “get people to book a demo”" />
      </Field>
      {messages.map((m, i) => (
        <Field key={i}>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor={`mt-${i}`}>Version {LETTERS[i]}</FieldLabel>
            {messages.length > 2 && (
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove version ${LETTERS[i]}`} onClick={() => setMessages(messages.filter((_, j) => j !== i))}>
                <XIcon />
              </Button>
            )}
          </div>
          <Textarea id={`mt-${i}`} rows={3} maxLength={2000} value={m} onChange={(e) => setMessages(messages.map((x, j) => (j === i ? e.target.value : x)))} />
        </Field>
      ))}
      {messages.length < 4 && (
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setMessages([...messages, ''])}>
          <PlusIcon /> Add a version
        </Button>
      )}
      <SegmentsField id="mt-segments" value={segments} onChange={setSegments} max={5} />
      <Field>
        <FieldLabel htmlFor="mt-per">People per group</FieldLabel>
        <Input id="mt-per" type="number" min={2} max={10} value={per} onChange={(e) => setPer(Number(e.target.value))} className="w-28" />
        <FieldDescription className={people > maxPanel ? 'text-brand' : undefined}>
          {people} people in all{people > maxPanel ? `; the most is ${maxPanel}` : ''}.
        </FieldDescription>
      </Field>
    </StudyFormShell>
  );
}
