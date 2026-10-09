import type { Advice, AdvisorAgent, AdvisorInfo } from '@/api/types';
import { Pip } from '@/components/brand/pip';
import type { AgentVariant } from '@/components/brand/pip-art';
import { cn } from '@/lib/utils';

/** The advisor's five agents in the order they work. Names and jobs come from the server. */
export const CREW: AdvisorAgent[] = ['scout', 'professor', 'murmur', 'baron', 'captain'];
const STICKER: Record<AdvisorAgent, AgentVariant> = { scout: 'scout', professor: 'professor', murmur: 'murmur', baron: 'baron', captain: 'captain' };

/** Who is working while a run sits in each status (mirrors AGENTS_AT in engine/advisor/agents.ts). */
export const WORKING: Record<Advice['status'], AdvisorAgent[]> = {
  queued: [],
  researching: ['scout', 'professor'],
  simulating: ['murmur'],
  deciding: ['baron', 'captain'],
  done: [],
  failed: [],
};

export const STAGE: Record<Advice['status'], string> = {
  queued: 'Waiting to start',
  researching: 'Reading the internet',
  simulating: 'Asking the buyers',
  deciding: 'Making the call',
  done: 'Done',
  failed: 'Did not finish',
};

export function AgentSticker({ agent, className, tilt }: { agent: AdvisorAgent; className?: string; tilt?: number }) {
  return <Pip variant={STICKER[agent]} className={className} tilt={tilt} />;
}

/** One agent with its name, for the head of a report section. */
export function AgentByline({ agent, info, children }: { agent: AdvisorAgent; info: AdvisorInfo | undefined; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <AgentSticker agent={agent} className="size-14" tilt={-6} />
      <div className="min-w-0">
        <p className="font-display text-lg font-bold leading-tight text-foreground">{info?.agents[agent].name}</p>
        <p className="text-sm text-muted-foreground">{children ?? info?.agents[agent].job}</p>
      </div>
    </div>
  );
}

/** The crew as a row of stickers; while a run works, the agents on duty lift and the rest wait. */
export function CrewLineup({ info, status }: { info: AdvisorInfo | undefined; status?: Advice['status'] }) {
  const busy = status ? WORKING[status] : [];
  const doneUpTo = status === 'done' ? CREW.length : busy.length ? CREW.indexOf(busy[0]) : 0;
  return (
    <ol className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {CREW.map((agent, i) => {
        const working = busy.includes(agent);
        return (
          <li key={agent} className={cn('flex flex-col items-center gap-2 rounded-3xl border bg-card p-4 text-center transition-opacity', status && !working && i >= doneUpTo && 'opacity-55')}>
            <AgentSticker agent={agent} className={cn('size-20', working && 'crew-bob')} tilt={i % 2 ? 5 : -5} />
            <p className="font-display text-[15px] font-bold leading-tight text-foreground">{info?.agents[agent].name}</p>
            <p className="text-xs text-body">{working ? 'Working on it' : status && i < doneUpTo ? 'Done' : info?.agents[agent].job}</p>
          </li>
        );
      })}
    </ol>
  );
}
