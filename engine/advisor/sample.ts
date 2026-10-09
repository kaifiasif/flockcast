/**
 * Canned findings for demos and tests, where the real sources cannot be reached. Every finding is
 * labelled as a sample and links nowhere real, so a report built on it cannot pass for research.
 */
import type { Finding, SearchAdapter } from './types.ts';

const SAMPLES: Omit<Finding, 'id'>[] = [
  { title: 'Ask: how do you test a post before it goes out?', text: 'I rewrite every LinkedIn post five times and still have no idea how it will land. I would pay for something that tells me which line people will argue with.' },
  { title: 'Show: I built a tool that scores tweets', text: 'Virality scores feel like horoscopes. A number out of 100 tells me nothing about what to change.' },
  { title: 'Ghostwriters, what do you charge?', text: 'Most of my clients pay $1,500 a month for four posts a week. Anything that saves me a round of edits is worth $20 a month to me.' },
  { title: 'Taplio vs Hypefury vs Typefully', text: 'Taplio is $39 a month and most of it is scheduling I already have. I only stayed for the post ideas.' },
  { title: 'Are AI writing tools making everything sound the same?', text: 'Everything sounds the same now. My readers can tell when a post was written by a tool and they scroll right past.' },
  { title: 'What would make you trust an AI feedback tool?', text: 'Show me why it thinks a line will flop. If it cannot point at the sentence, I will not trust the score.' },
  { title: 'Cheapest way to get feedback on drafts?', text: 'I post drafts in a small group chat first. Free, but slow, and my friends are too nice.' },
  { title: 'Paying for creator tools in 2026', text: 'I cancel anything over $15 a month unless it saves me an hour a week. Free trials without a card are the only ones I try.' },
].map((s, i) => ({ ...s, source: 'Sample (demo)', url: `https://example.com/sample/${i + 1}`, date: null, score: 100 - i * 10 }));

export function sampleSearch(): SearchAdapter {
  return {
    name: 'sample',
    async search(_query, { limit }) {
      return SAMPLES.slice(0, limit);
    },
  };
}
