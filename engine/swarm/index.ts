/**
 * The built-in audience simulator ("swarm"): personas, feed rounds and the report. The crowd itself is
 * Python (agents/flockcast_agents/swarm); this adapter hands it the post and settings and keeps what
 * interviews need. Written from MiroFish's documented workflow, not its code.
 */
import { AgentError, pythonAgents, type Agents } from '../agents.ts';
import { platformOf } from '../platforms.ts';
import type { Engine, RehearsalResult } from '../types.ts';

/** The default follower mix. Kept in step with DEFAULT_AUDIENCE in agents/flockcast_agents/swarm/personas.py. */
export const DEFAULT_AUDIENCE = [
  'Peers: people in the same field who reply with their own experience.',
  'Skeptics: followers who push back on claims that sound too neat or lack a source.',
  'Lurkers: people who like and repost but rarely reply.',
  'Newcomers: people seeing the author for the first time through a repost.',
].join('\n');

/** Joins thread parts as "1/3 ...", so the simulation sees one post, as followers would see the opener. */
export const draftOf = (posts: string[]) => posts.map((p, i) => (posts.length > 1 ? `${i + 1}/${posts.length} ${p}` : p)).join('\n\n');

/** Runs offline (a labelled estimate, no interviews) when the agents have no model. */
export function swarmEngine({ agents = pythonAgents() }: { agents?: Agents } = {}): Engine {
  const { llm } = agents;
  return {
    kind: llm ? 'swarm' : 'swarm-offline',
    canInterview: Boolean(llm),
    model: llm?.model ?? null,

    async run({ input, settings, onStage }) {
      if (!input.posts.length || input.posts.some((p) => !p.trim())) throw new Error('Nothing to rehearse: the post is empty.');
      return agents.run<{ result: RehearsalResult; state: unknown }>('rehearse', { input, settings: { ...settings, studio: true }, platform: platformOf(settings.platform) }, (status, progress) =>
        onStage(status as Parameters<typeof onStage>[0], progress),
      );
    },

    async interview({ state, agentId, question }) {
      if (!llm) throw Object.assign(new Error('Interviews need a model key.'), { status: 409 });
      const platform = platformOf((state as { platform?: string } | null)?.platform);
      try {
        const { answer } = await agents.run<{ answer: string }>('interview', { state, agent_id: agentId, question, platform });
        return answer;
      } catch (e) {
        // a missing person or a refused question keeps its status; anything else is the model failing
        if (e instanceof AgentError && ![400, 404, 409].includes(e.status)) throw new Error(e.message, { cause: e });
        throw e;
      }
    },
  };
}
