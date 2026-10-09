/**
 * The built-in audience simulator ("swarm"): personas, feed rounds, report, all in-process. It does the
 * job MiroFish does for this use case with no MiroFish, no Zep and no Python. Written from MiroFish's
 * documented workflow, not its code.
 */
import { counting, type Llm } from '../llm.ts';
import { platformOf } from '../platforms.ts';
import { summarize } from '../summarize.ts';
import type { Engine, Persona, RehearsalResult } from '../types.ts';
import { generatePersonas } from './personas.ts';
import { interviewPersona, writeReport } from './report.ts';
import { createWorld, rngFrom, simulate } from './simulate.ts';

export { DEFAULT_AUDIENCE } from './personas.ts';

/** What interviews need later, kept with the rehearsal. */
interface SwarmState {
  draft: string;
  handle: string;
  platform: string;
  personas: Persona[];
  memory: Record<number, string[]>;
}

/** Joins thread parts as "1/3 ...", so the simulation sees one post, as followers would see the opener. */
export const draftOf = (posts: string[]) => posts.map((p, i) => (posts.length > 1 ? `${i + 1}/${posts.length} ${p}` : p)).join('\n\n');

export function swarmEngine({ llm = null }: { llm?: Llm | null } = {}): Engine {
  return {
    kind: llm ? 'swarm' : 'swarm-offline',
    canInterview: Boolean(llm),
    model: llm?.model ?? null,

    async run({ input, settings, onStage }) {
      if (!input.posts.length || input.posts.some((p) => !p.trim())) throw new Error('Nothing to rehearse: the post is empty.');
      const draft = draftOf(input.posts);
      const platform = platformOf(settings.platform);
      const rng = rngFrom(`${draft}|${settings.audience ?? ''}|${platform.id}|${settings.personas}`);
      const model = llm ? counting(llm) : null;

      onStage('preparing', 5);
      const personas = await generatePersonas({ llm: model, audience: settings.audience, examples: input.examples ?? [], handle: settings.handle, platform, count: settings.personas, rng });

      onStage('running', 20);
      const world = createWorld({ handle: settings.handle, draft, personas, platform });
      const rounds = await simulate({ llm: model, world, rounds: settings.rounds, rng, onRound: (r, n) => onStage('running', 20 + Math.round((65 * r) / n)) });

      onStage('reporting', 88);
      const summary = summarize({ draft, sentences: input.sentences, posts: world.posts, actions: world.actions, rounds });
      let report: RehearsalResult['report'] = null;
      let reportError: string | undefined;
      // the report is useful but not essential: keep the simulation if it fails
      try {
        report = { markdown: await writeReport({ llm: model, handle: settings.handle, draft, summary, world, personas: personas.length }) };
      } catch (e) {
        reportError = (e as Error).message;
      }
      const result: RehearsalResult = {
        ...summary,
        agents: personas.length,
        engine: llm ? 'swarm' : 'swarm-offline',
        model: llm?.model ?? null,
        model_calls: model?.calls ?? 0,
        platform: platform.id,
        personas: personas.map(({ id, name, segment, stance, bio }) => ({ id, name, segment, stance, bio })),
        report,
        ...(reportError ? { report_error: reportError } : {}),
      };
      const state: SwarmState = { draft, handle: settings.handle, platform: platform.id, personas, memory: Object.fromEntries(world.memory) };
      return { result, state };
    },

    async interview({ state, agentId, question }) {
      if (!llm) throw Object.assign(new Error('Interviews need a model key.'), { status: 409 });
      const s = state as SwarmState;
      const persona = s?.personas?.find((p) => p.id === agentId);
      if (!persona) throw Object.assign(new Error(`There is no simulated person #${agentId}.`), { status: 404 });
      return interviewPersona({ llm, handle: s.handle, draft: s.draft, persona, history: s.memory[agentId] ?? [], question, platform: platformOf(s.platform) });
    },
  };
}
