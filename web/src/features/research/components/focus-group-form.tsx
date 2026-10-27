import { useState } from 'react';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { StudyFormShell } from './form-shell';
import { cleanSegments, SegmentsField, type SegmentDraft } from './segments-field';

const QUESTIONS = 'What is your first reaction?\nWhat would stop you from sharing this?\nWhat is missing?';

export function FocusGroupForm({ projectId }: { projectId: string }) {
  const [topic, setTopic] = useState('');
  const [material, setMaterial] = useState('');
  const [questions, setQuestions] = useState(QUESTIONS);
  const [segments, setSegments] = useState<SegmentDraft[]>([{ name: 'Customers', about: '' }, { name: 'Skeptics', about: 'Doubt claims that sound too neat' }]);
  const [panelists, setPanelists] = useState(8);
  const asked = questions.split('\n').map((q) => q.trim()).filter(Boolean);
  return (
    <StudyFormShell
      projectId={projectId}
      action="Run the focus group"
      ready={!!topic.trim() && !!material.trim() && asked.length > 0 && asked.length <= 5 && cleanSegments(segments).length > 0}
      build={() => ({ kind: 'focus_group', topic: topic.trim(), material: material.trim(), questions: asked, segments: cleanSegments(segments), panelists })}
    >
      <Field>
        <FieldLabel htmlFor="fg-topic">Topic</FieldLabel>
        <Input id="fg-topic" required maxLength={120} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="New pricing page" />
      </Field>
      <Field>
        <FieldLabel htmlFor="fg-material">What the group sees</FieldLabel>
        <Textarea id="fg-material" required maxLength={4000} rows={5} value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="Paste a post, a pitch, an ad script or a product description." />
      </Field>
      <Field>
        <FieldLabel htmlFor="fg-questions">Questions, one per line</FieldLabel>
        <Textarea id="fg-questions" rows={4} value={questions} onChange={(e) => setQuestions(e.target.value)} />
        <FieldDescription>Up to five. Maple asks them in order and everyone hears the earlier answers.</FieldDescription>
      </Field>
      <SegmentsField id="fg-segments" value={segments} onChange={setSegments} max={4} />
      <Field>
        <FieldLabel htmlFor="fg-panel">People on the panel</FieldLabel>
        <Input id="fg-panel" type="number" min={4} max={12} value={panelists} onChange={(e) => setPanelists(Number(e.target.value))} className="w-28" />
      </Field>
    </StudyFormShell>
  );
}
