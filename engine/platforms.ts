/**
 * Where the simulated audience lives. The feed mechanics are the same everywhere; what changes is the
 * name people see, how long a reply can be, the words for each action, and the room's manners.
 */
export interface Platform {
  id: string;
  name: string;
  /** Longest reply or quote a simulated person writes. */
  replyChars: number;
  verbs: { like: string; repost: string; reply: string; quote: string };
  /** One line on how people behave there, given to the model. */
  culture: string;
}

export const PLATFORMS: Record<string, Platform> = {
  x: {
    id: 'x',
    name: 'X',
    replyChars: 280,
    verbs: { like: 'like', repost: 'repost', reply: 'reply', quote: 'quote' },
    culture: 'Fast, blunt and public. Replies are short; quote posts are used to argue or to add a take.',
  },
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    replyChars: 600,
    verbs: { like: 'react', repost: 'repost', reply: 'comment', quote: 'share with thoughts' },
    culture: 'Professional and polite on the surface. People comment with their own experience and job title in mind; open disagreement is rarer but pointed.',
  },
  threads: {
    id: 'threads',
    name: 'Threads',
    replyChars: 500,
    verbs: { like: 'like', repost: 'repost', reply: 'reply', quote: 'quote' },
    culture: 'Casual and friendly. Lots of short agreement; pushback tends to be gentle.',
  },
  bluesky: {
    id: 'bluesky',
    name: 'Bluesky',
    replyChars: 300,
    verbs: { like: 'like', repost: 'repost', reply: 'reply', quote: 'quote' },
    culture: 'Text-first and opinionated. People call out hype and AI claims quickly.',
  },
  reddit: {
    id: 'reddit',
    name: 'Reddit',
    replyChars: 800,
    verbs: { like: 'upvote', repost: 'crosspost', reply: 'comment', quote: 'crosspost with a comment' },
    culture: 'Skeptical of self-promotion. Comments ask for details and sources; the top comment often disagrees.',
  },
  generic: {
    id: 'generic',
    name: 'a social feed',
    replyChars: 400,
    verbs: { like: 'like', repost: 'share', reply: 'reply', quote: 'share with a comment' },
    culture: 'A general audience: most people scroll, some react, a few reply.',
  },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS) as [string, ...string[]];

export function platformOf(id: string | undefined): Platform {
  return PLATFORMS[id ?? 'x'] ?? PLATFORMS.x;
}
