/**
 * Worked example, HTTP mode: Creator OS calls a Flockcast server with the generic client, the same
 * way any other app would. Creator OS keeps its own blind-study rule: it only rehearses a draft after
 * the creator has decided on it.
 */
import { flockcastClient } from '../http-client/flockcast-client.ts';

export function rehearseAfterDecision(runId: string, finalText: string, env: NodeJS.ProcessEnv = process.env) {
  const flockcast = flockcastClient({ url: env.FLOCKCAST_URL as string, key: env.FLOCKCAST_KEY as string });
  return flockcast.rehearse(finalText, { subject: `run:${runId}` });
}
