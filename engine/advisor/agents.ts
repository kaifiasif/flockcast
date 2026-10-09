/**
 * The advisor is five small agents, each with one job and a name people remember. The web app gives
 * each one a Pip sticker; the names here are the single source so the report and the UI agree.
 */
import type { AdviceStatus } from './types.ts';

export const ADVISOR_AGENTS = {
  scout: { name: 'Bramble the Scout', job: 'Searches Reddit, Hacker News and the web for people talking about your problem.' },
  professor: { name: 'Professor Quill', job: 'Reads what was found, names your competitors and copies the exact words people used.' },
  murmur: { name: 'Mystic Mira', job: 'Gathers a crowd of simulated buyers and asks each one what they would pay.' },
  baron: { name: 'Lord Ledger', job: 'Turns the buyers’ answers into a price range and the plans to sell.' },
  captain: { name: 'Captain Compass', job: 'Makes the call, picks the features to build and writes your launch steps and post.' },
} as const;
export type AdvisorAgent = keyof typeof ADVISOR_AGENTS;

/** Who is working while a run sits in each status. */
export const AGENTS_AT: Record<AdviceStatus, AdvisorAgent[]> = {
  queued: [],
  researching: ['scout', 'professor'],
  simulating: ['murmur'],
  deciding: ['baron', 'captain'],
  done: [],
  failed: [],
};
