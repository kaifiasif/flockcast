/** The research crew. Names live here so the server, the API and the app agree. */
import type { StudyKind } from './types.ts';

export const RESEARCH_AGENTS = {
  maple: { name: 'Moderator Maple', job: 'Runs a focus group: asks your questions, lets the panel talk, writes up the themes.' },
  tally: { name: 'Tally the Pollster', job: 'Scores each version of a message with every group and flags where groups disagree.' },
  juniper: { name: 'Juniper the Steady', job: 'Tries your statement on customers, press and others before a hard moment, and drafts a steadier one.' },
  ivy: { name: 'Ivy the Guardian', job: 'Checks every draft against your brand rules: banned words, required lines and voice.' },
} as const;
export type ResearchAgent = keyof typeof RESEARCH_AGENTS;

export const AGENT_FOR: Record<StudyKind, ResearchAgent> = { focus_group: 'maple', message_test: 'tally', crisis: 'juniper' };
