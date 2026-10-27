import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StudyFormShell } from './form-shell';

const GROUPS = [
  { id: 'customers', label: 'Customers' },
  { id: 'press', label: 'Press' },
  { id: 'employees', label: 'Employees' },
  { id: 'investors', label: 'Investors' },
  { id: 'regulators', label: 'Regulators' },
  { id: 'critics', label: 'Critics' },
] as const;
type Group = (typeof GROUPS)[number]['id'];

export function CrisisForm({ projectId }: { projectId: string }) {
  const [situation, setSituation] = useState('');
  const [statement, setStatement] = useState('');
  const [groups, setGroups] = useState<Group[]>(['customers', 'press', 'critics']);
  return (
    <StudyFormShell
      projectId={projectId}
      action="Rehearse the statement"
      ready={!!situation.trim() && !!statement.trim() && groups.length > 0}
      build={() => ({ kind: 'crisis', situation: situation.trim(), statement: statement.trim(), stakeholders: groups, rounds: 2 })}
    >
      <Field>
        <FieldLabel htmlFor="cr-situation">What happened?</FieldLabel>
        <Textarea id="cr-situation" required rows={3} maxLength={2000} value={situation} onChange={(e) => setSituation(e.target.value)} placeholder="Checkout was down for six hours on Monday and some payments failed twice." />
        <FieldDescription>Stick to facts you know. The revised statement never adds facts you didn't give.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="cr-statement">The statement you plan to put out</FieldLabel>
        <Textarea id="cr-statement" required rows={5} maxLength={3000} value={statement} onChange={(e) => setStatement(e.target.value)} />
      </Field>
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium text-foreground">Who reacts</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {GROUPS.map((g) => (
            <Label key={g.id} className="flex items-center gap-2 font-normal">
              <Checkbox checked={groups.includes(g.id)} onCheckedChange={(on) => setGroups(on ? [...groups, g.id] : groups.filter((x) => x !== g.id))} />
              {g.label}
            </Label>
          ))}
        </div>
      </fieldset>
    </StudyFormShell>
  );
}
