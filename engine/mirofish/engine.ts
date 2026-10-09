/**
 * Optional engine: runs the rehearsal on an external MiroFish backend instead of the built-in swarm.
 * Use it when you need crowds of thousands or MiroFish's graph memory; it needs an LLM key and a Zep
 * Cloud key on the MiroFish side, and it simulates X only.
 */
import { platformOf } from '../platforms.ts';
import { DEFAULT_AUDIENCE, draftOf } from '../swarm/index.ts';
import { pythonAgents, type Agents } from '../agents.ts';
import type { Engine, RehearsalInput, RehearsalResult, RehearsalSettings } from '../types.ts';
import type { MiroFishClient } from './client.ts';

const EXAMPLES = 25;

/** The document MiroFish builds personas from: it turns named groups in it into people. */
export function buildSeed(input: RehearsalInput, settings: RehearsalSettings) {
  const draft = draftOf(input.posts);
  const { handle } = settings;
  const sample = (input.examples ?? []).slice(0, EXAMPLES);
  const seedMarkdown = [
    `# ${handle} on X`,
    '',
    `${handle} posts on X. The posts below are what ${handle} has published before; they show the voice and topics followers already know.`,
    '',
    '## Audience',
    '',
    (settings.audience || DEFAULT_AUDIENCE).trim(),
    '',
    '## Past posts',
    '',
    ...(sample.length ? sample.map((a) => `- ${a.text.replace(/\s+/g, ' ').trim()}`) : ['- (no past posts given)']),
    '',
    '## New post about to be published',
    '',
    draft,
    '',
  ].join('\n');
  const requirement = [
    `Simulate how ${handle}'s followers on X react in the hours after ${handle} publishes the new post below.`,
    `The first initial post must be exactly this text, posted by ${handle}:`,
    `"""${draft}"""`,
    'Predict: who replies and what they say, which specific sentences draw agreement or pushback,',
    'whether people repost or quote it and why, and anything that would make the author regret posting it.',
  ].join('\n');
  return { seedMarkdown, requirement, draft };
}

interface MiroFishState {
  simulation_id: string;
}

/** `agents` turns MiroFish's feed into the same summary the built-in crowd produces. */
export function mirofishEngine({ client, agents = pythonAgents() }: { client: MiroFishClient; agents?: Agents }): Engine {
  return {
    kind: 'mirofish',
    canInterview: true,
    model: null,

    async run({ input, settings, onStage }) {
      const span = (status: 'preparing' | 'running' | 'reporting', from: number, width: number) => (d: Record<string, unknown>) => {
        const pct = Number(d?.progress ?? d?.progress_percent ?? 0);
        onStage(status, Math.round(from + (width * Math.min(Math.max(pct, 0), 100)) / 100));
      };
      const { seedMarkdown, requirement, draft } = buildSeed(input, settings);
      onStage('preparing', 2);
      const onto = await client.generateOntology({ seedMarkdown, requirement, projectName: `rehearsal ${new Date().toISOString().slice(0, 16)}` });
      const graph = await client.buildGraph(onto.project_id, { onProgress: span('preparing', 5, 25) });
      const sim = await client.createSimulation(onto.project_id, graph.graph_id);
      await client.prepare(sim.simulation_id, { onProgress: span('preparing', 30, 20) });

      onStage('running', 50);
      const status = await client.run(sim.simulation_id, { maxRounds: settings.rounds, onProgress: span('running', 50, 35) });

      onStage('reporting', 85);
      const [posts, actions] = await Promise.all([client.posts(sim.simulation_id), client.actions(sim.simulation_id)]);
      let report = null;
      let reportError: string | undefined;
      try {
        const r = await client.report(sim.simulation_id, { onProgress: span('reporting', 85, 14) });
        report = { markdown: String(r.markdown_content ?? '') };
      } catch (e) {
        reportError = (e as Error).message;
      }
      type Summary = Omit<RehearsalResult, 'engine' | 'model' | 'model_calls' | 'platform' | 'personas' | 'report' | 'report_error'>;
      const { summary } = await agents.run<{ summary: Summary }>('summarize', { draft, sentences: input.sentences, posts: posts.posts ?? [], actions: actions.actions ?? [], rounds: Number(status.current_round) || null });
      const state: MiroFishState = { simulation_id: sim.simulation_id };
      return {
        result: { ...summary, engine: 'mirofish', model: null, model_calls: 0, platform: platformOf('x').id, personas: [], report, ...(reportError ? { report_error: reportError } : {}) },
        state,
      };
    },

    async interview({ state, agentId, question }) {
      const id = (state as MiroFishState | null)?.simulation_id;
      if (!id) throw Object.assign(new Error('This rehearsal has no MiroFish simulation to ask.'), { status: 409 });
      try {
        const data = await client.interview(id, agentId, question);
        return String(data?.result?.response ?? data?.result?.platforms?.twitter?.response ?? data?.response ?? '');
      } catch (e) {
        throw new Error(`MiroFish could not run the interview (${(e as Error).message}). Its simulation may have shut down; start a new rehearsal to ask more.`);
      }
    },
  };
}
