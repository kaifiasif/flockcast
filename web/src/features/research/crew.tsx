import type { ResearchAgent, Study } from '@/api/types';
import { Pip } from '@/components/brand/pip';
import type { ResearchVariant } from '@/components/brand/pip-art';
import { useAppConfig } from '@/features/projects/api';

const STICKER: Record<ResearchAgent, ResearchVariant> = { maple: 'moderator', tally: 'pollster', juniper: 'steady', ivy: 'guardian' };

export type StudyKind = Study['kind'];
export const KINDS: { kind: StudyKind; agent: ResearchAgent; label: string; blurb: string }[] = [
  { kind: 'focus_group', agent: 'maple', label: 'Focus group', blurb: 'A small panel discusses your material and answers your questions.' },
  { kind: 'message_test', agent: 'tally', label: 'Message test', blurb: 'Two to four versions, scored by several groups at once.' },
  { kind: 'crisis', agent: 'juniper', label: 'Crisis rehearsal', blurb: 'Try a statement on customers, press and others before a hard moment.' },
];
export const KIND_LABEL: Record<StudyKind, string> = { focus_group: 'Focus group', message_test: 'Message test', crisis: 'Crisis rehearsal' };

export const STAGE: Record<Study['status'], string> = {
  queued: 'Waiting to start',
  preparing: 'Recruiting the panel',
  running: 'Talking to people',
  reporting: 'Writing it up',
  done: 'Done',
  failed: 'Did not finish',
};

export function ResearchSticker({ agent, className, tilt }: { agent: ResearchAgent; className?: string; tilt?: number }) {
  return <Pip variant={STICKER[agent]} className={className} tilt={tilt} />;
}

/** One research agent with its name, at the head of the section it wrote. Names come from the server. */
export function ResearchByline({ agent, children }: { agent: ResearchAgent; children?: React.ReactNode }) {
  const info = useAppConfig().data?.research.agents[agent];
  return (
    <div className="flex items-center gap-3">
      <ResearchSticker agent={agent} className="size-14 shrink-0" tilt={-6} />
      <div className="min-w-0">
        <p className="font-display text-lg font-bold leading-tight text-foreground">{info?.name}</p>
        <p className="text-sm text-muted-foreground">{children ?? info?.job}</p>
      </div>
    </div>
  );
}
