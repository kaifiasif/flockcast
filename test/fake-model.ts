/**
 * A local stand-in for an OpenAI-compatible model, for trying the whole app without a key:
 *
 *   node --no-warnings test/fake-model.ts            # listens on http://localhost:4199/v1
 *   REHEARSAL_LLM_PROVIDER=custom REHEARSAL_LLM_BASE_URL=http://localhost:4199/v1 \
 *   REHEARSAL_LLM_API_KEY=fake npm start
 *
 * It answers each prompt the swarm engine sends (personas, rounds, report, interviews) with
 * plausible canned JSON. It is not a model: replies are picked from a list, not written.
 */
import { createServer, type Server } from 'node:http';

const PEOPLE = [
  { name: 'Maya Okafor', segment: 'Data people', bio: 'Analyst who asks for the source before sharing anything with a number in it.', interests: ['data', 'research'], stance: 'skeptical' },
  { name: 'Jon Park', segment: 'Fellow writers', bio: 'Writes a weekly newsletter and collects editing tricks.', interests: ['writing', 'editing'], stance: 'supportive' },
  { name: 'Ade Bello', segment: 'New here', bio: 'Found the author through a repost yesterday.', interests: ['ai tools'], stance: 'neutral' },
  { name: 'Lena Fischer', segment: 'Researchers', bio: 'Studies how people review machine-written text.', interests: ['nlp', 'hci'], stance: 'skeptical' },
  { name: 'Sam Rivera', segment: 'Founders', bio: 'Runs a small startup and skims everything between meetings.', interests: ['startups', 'productivity'], stance: 'supportive' },
  { name: 'Priya Nair', segment: 'Engineers', bio: 'Backend engineer, likes concrete examples over advice.', interests: ['code review'], stance: 'neutral' },
  { name: 'Tom Becker', segment: 'Fellow writers', bio: 'Ghostwriter who has opinions about hooks.', interests: ['copywriting'], stance: 'supportive' },
  { name: 'Grace Lin', segment: 'Data people', bio: 'Statistician who reads the methods section first.', interests: ['statistics'], stance: 'skeptical' },
  { name: 'Omar Haddad', segment: 'New here', bio: 'Student exploring writing tools.', interests: ['learning'], stance: 'neutral' },
  { name: 'Ines Duarte', segment: 'Founders', bio: 'Product lead who shares practical tips with her team.', interests: ['product'], stance: 'supportive' },
  { name: 'Kenji Mori', segment: 'Engineers', bio: 'Reviews pull requests all day and reads backwards out of habit.', interests: ['tooling'], stance: 'neutral' },
  { name: 'Ruth Adeyemi', segment: 'Researchers', bio: 'Fact-checker at a small newsroom.', interests: ['verification'], stance: 'skeptical' },
];

const LINES: Record<string, string[]> = {
  skeptical: ['Where is the 40% from? I would want the study before I repost this.', 'The second sentence is doing a lot of work for a number with no source.', 'Fluent lines hide errors, sure, but 40% sounds made up without a link.'],
  supportive: ['Reading drafts backwards is such a good trick. Stealing it.', 'This matches what I see editing every week.', 'Sharing with my team, we skim exactly those lines.'],
  neutral: ['What counts as a fluent line? An example would help.', 'Interesting. Does reading backwards work for threads too?', 'Saving this to try on my next draft.'],
};


const BUYERS = [
  ['Maya Okafor', 'LinkedIn creators', 'Posts three times a week to grow a consulting practice.', 4, true, 'Another subscription on top of the scheduler I pay for.', 'Point at the exact line people will argue with.', [5, 9, 19, 35]],
  ['Jon Park', 'Ghostwriters', 'Writes for six founders and bills by the month.', 5, true, 'It has to handle several clients without mixing them up.', 'Separate projects per client.', [9, 15, 29, 59]],
  ['Ade Bello', 'New creators', 'Started posting this year and is unsure what works.', 3, true, 'I cannot tell if simulated people are anything like my readers.', 'Explain the result in plain words.', [2, 5, 12, 20]],
  ['Lena Fischer', 'Researchers', 'Studies how people review machine-written text.', 2, false, 'Simulated readers are not real readers.', 'Show how the crowd was built.', [5, 10, 25, 40]],
  ['Sam Rivera', 'Founders', 'Runs a small startup and posts launch updates.', 4, true, 'Only worth it if it is faster than asking my team.', 'Results in under a minute.', [8, 15, 29, 49]],
  ['Priya Nair', 'Engineers', 'Shares technical threads on X.', 2, false, 'I already ask a friend to read my drafts.', 'Free to try without a card.', [1, 4, 10, 18]],
  ['Tom Becker', 'Ghostwriters', 'Opinions about hooks, and a waiting list of clients.', 4, true, 'Virality scores have burned me before.', 'Say why, not just a score.', [10, 19, 39, 69]],
  ['Grace Lin', 'Marketers', 'Runs social for a small brand.', 3, true, 'Needs sign-off from my manager for any tool.', 'An invoice and a team plan.', [9, 19, 49, 99]],
] as const;

function advisorAnswer(prompt: string): unknown {
  if (/You plan web searches/.test(prompt)) return { queries: ['test a post before publishing', 'linkedin post feedback tool', 'taplio alternative', 'creator tool too expensive'] };
  if (/You are a market researcher/.test(prompt)) {
    const findings = [...prompt.matchAll(/<finding id="(f\d+)" source="[^"]*">([^<]*)<\/finding>/g)].map((m) => ({ id: m[1], text: m[2] }));
    const kinds = ['pain', 'doubt', 'pain', 'request', 'praise'];
    return {
      summary: 'People who post often want to know how a post will land before it goes out, and distrust tools that only give a score. Scheduling tools are crowded and priced around $15 to $40 a month; few explain why a line will flop.',
      competitors: [
        { name: 'Taplio', what: 'LinkedIn scheduling and post ideas', price: '$39 a month', strength: 'Big library of post ideas', weakness: 'Mostly scheduling people already have', finding: findings.find((f) => /Taplio/.test(f.text))?.id ?? null },
        { name: 'Asking friends', what: 'A group chat of people who read drafts', price: 'Free', strength: 'Real people', weakness: 'Slow, and friends are too nice', finding: findings.find((f) => /group chat/.test(f.text))?.id ?? null },
      ],
      voices: findings.slice(0, 5).map((f, i) => ({ kind: kinds[i], quote: f.text.split(/(?<=[.!?])\s/).at(-1), finding: f.id })),
      price_signals: ['Creators cancel tools over about $15 a month unless they save an hour a week.', 'Ghostwriters would pay about $20 a month to save a round of edits.'],
    };
  }
  const buyers = prompt.match(/Create (\d+) potential buyers/);
  if (buyers) {
    return {
      buyers: Array.from({ length: Number(buyers[1]) }, (_, i) => {
        const [name, segment, bio, interest, would_try, objection, must_have, p] = BUYERS[i % BUYERS.length];
        const bump = Math.floor(i / BUYERS.length);
        return { name: bump ? `${name.split(' ')[0]} ${String.fromCharCode(65 + bump)}.` : name, segment, bio, interest, would_try, objection, must_have, prices: { too_cheap: p[0] + bump, bargain: p[1] + bump, expensive: p[2] + bump, too_expensive: p[3] + bump } };
      }),
    };
  }
  if (/You are a launch advisor/.test(prompt)) {
    const cite = prompt.match(/\[(f\d+)\]/)?.[1] ?? null;
    return {
      verdict: 'go_with_changes',
      headline: 'Launch to ghostwriters and LinkedIn creators first, after you add one-line explanations for every flagged sentence.',
      reasons: ['Ghostwriters and founders were the most interested, and they already pay for tools.', 'The top doubt is trust: people want to see why, not a score.', 'Prices people accept sit well under the $39 tools they complain about.'],
      features: [
        { name: 'Why cards on flagged lines', why: 'People do not trust a score without a reason.', effort: 'small', finding: cite },
        { name: 'One project per client', why: 'Ghostwriters juggle several voices.', effort: 'small', finding: null },
        { name: 'Side-by-side drafts', why: 'Choosing between two hooks is the most common edit.', effort: 'medium', finding: null },
      ],
      steps: ['Add the why cards before launch.', 'Offer a free plan with 5 rehearsals a month, no card.', 'Post the launch on LinkedIn and in two ghostwriter communities.', 'DM 20 ghostwriters a free month in exchange for feedback.', 'After two weeks, read the cancel reasons and fix the top one.'],
      risks: ['People may treat a rehearsal as a promise. Keep the "simulated, not predicted" label everywhere.', 'Scheduling tools could add a similar check.'],
      launch_post: 'I kept rewriting posts with no idea which line would start an argument. So I built Flockcast: paste a draft, a simulated crowd reacts, and it shows the exact sentences they push back on and why. It is a rehearsal, not a prediction. Free for 5 rehearsals a month. I would love your harshest feedback.',
      free_tier: true,
      tiers: {
        free: { name: 'Free', who: 'Anyone trying it out', includes: ['5 rehearsals a month', '12 simulated followers', 'Why cards'] },
        hero: { name: 'Creator', who: 'People who post every week', includes: ['Unlimited rehearsals', 'Side-by-side drafts', 'Ask followers questions'] },
        top: { name: 'Studio', who: 'Ghostwriters with several clients', includes: ['Everything in Creator', 'One project per client', 'API access'] },
      },
      price_why: 'Most simulated buyers called the Creator price a bargain and only a few called it expensive. Studio is the plan for people who bill clients, so it can cost more.',
    };
  }
  return null;
}

/** The studio crew: AI-sounding check, fixes, reply prep and the one-call quick read. */
function studioAnswer(prompt: string): unknown {
  if (/seen thousands of AI-written posts/.test(prompt)) {
    const lines = [...prompt.matchAll(/^(\d+)\. (.+)$/gm)];
    const hit = lines.find((m) => /fluent|game.?changer|delve|not just/i.test(m[2])) ?? lines[0];
    return { flags: hit ? [{ sentence: Number(hit[1]), why: 'A tidy general claim with no example reads like a template.' }] : [] };
  }
  if (/These sentences drew pushback/.test(prompt)) {
    const items = [...prompt.matchAll(/^(\d+)\. "(.+)"$/gm)];
    return { fixes: items.map((m) => ({ sentence: Number(m[1]), why: 'Readers want to know where the claim comes from before they share it.', rewrite: /\d+%/.test(m[2]) ? m[2].replace(/(\d+%)/, '$1 [source]') : `${m[2].replace(/[.!?]$/, '')}, for example [source].` })) };
  }
  if (/answer the first replies/.test(prompt)) {
    const block = prompt.split('Replies to answer:')[1] ?? '';
    const items = [...block.matchAll(/^(\d+)\. ([^:]+):/gm)];
    return { answers: items.map((m) => ({ reply: Number(m[1]), answer: `Fair point, ${m[2].split(' ')[0]}. Here is where it comes from: [link]. I should have put it in the post.` })) };
  }
  const quick = prompt.match(/Imagine (\d+) distinct readers/);
  if (quick) {
    const reactions = ['reply', 'like', 'nothing', 'reply', 'repost', 'like'];
    return {
      readers: Array.from({ length: Number(quick[1]) }, (_, i) => {
        const p = PEOPLE[i % PEOPLE.length];
        const reaction = reactions[i % reactions.length];
        return { name: p.name, segment: p.segment, bio: p.bio, stance: p.stance, reaction, text: reaction === 'reply' ? LINES[p.stance][i % 3] : '' };
      }),
    };
  }
  return null;
}

/** The research crew: panels, focus groups, message tests, crisis rehearsals and brand voice. */
function researchAnswer(prompt: string): unknown {
  const ids = () => [...prompt.matchAll(/^#(\d+) /gm)].map((m) => Number(m[1]));
  const recruit = prompt.match(/Recruit (\d+) people for each of these groups:\n((?:- .+\n?)+)/);
  if (recruit) {
    const groups = [...recruit[2].matchAll(/^- ([^:\n]+)/gm)].map((m) => m[1].trim());
    return { people: groups.flatMap((g) => Array.from({ length: Number(recruit[1]) }, (_, i) => ({ name: `${g.split(' ')[0]} ${String.fromCharCode(65 + i)}.`, segment: g, bio: `Works in ${g.toLowerCase()}.`, stance: ['supportive', 'skeptical', 'neutral'][i % 3] }))) };
  }
  if (/simulated focus group/.test(prompt)) {
    return { answers: ids().map((id) => ({ person: id, text: id % 2 ? 'I like that it shows who pushes back before I post.' : 'Where does the 80% come from? I would not share it without that.', sentiment: id % 2 ? 'positive' : 'negative' })) };
  }
  if (/experienced focus group moderator/.test(prompt)) {
    const all = ids();
    return { themes: [{ title: 'Proof before sharing', detail: 'Skeptics want a source for the headline number.', people: all.filter((i) => i % 2 === 0) }], agreement: 'Seeing pushback early is useful.', disagreement: 'Whether the number is believable.', by_segment: [], recommendations: ['Link the source for 80%.'] };
  }
  if (/rate messages the way that person/.test(prompt)) {
    const versions = [...prompt.matchAll(/^([A-D]): /gm)].map((m) => m[1]);
    return { ratings: ids().flatMap((id) => versions.map((v, i) => ({ person: id, message: v, appeal: i === 1 ? 4 : 2, clarity: 4, credibility: i === 1 ? 4 : 2, act: i === 1, says: i === 1 ? 'Clear and I know what to do.' : 'Sounds like hype.' }))) };
  }
  if (/stakeholder groups react/.test(prompt)) {
    const groups = [...prompt.matchAll(/^- (customers|press|employees|investors|regulators|critics):/gm)].map((m) => m[1]);
    const statement = prompt.split('The statement:\n')[1]?.split('\n')[0] ?? '';
    return { reactions: groups.map((g, i) => ({ group: g, heat: 3 + (i % 2), reaction: `${g} want to know who is responsible.`, worst_line: statement.split('.')[0], question: 'When will it be fixed?' })) };
  }
  if (/how a story develops/.test(prompt)) return { spread: 'medium', why: 'The vendor line invites a follow-up.', headlines: ['App blames vendor for outage'], follow_ups: ['Which vendor?'] };
  if (/crisis communications adviser/.test(prompt)) return { changes: ['Apologise first.', 'Say what you will do and when.'], revised: 'We are sorry. Our payments were down for 6 hours on Monday, and 2,000 orders failed. We will refund every one by [fact].' };
  if (/You are a brand editor/.test(prompt)) return { fits: false, why: 'The tone is louder than the brand voice.', issues: [{ sentence: 1, rule: 'Calm voice', why: 'Reads as hype.' }] };
  return null;
}

export function answer(prompt: string): unknown {
  const advice = advisorAnswer(prompt) ?? studioAnswer(prompt) ?? researchAnswer(prompt);
  if (advice) return advice;
  const count = prompt.match(/Create (\d+) distinct people/);
  if (count) {
    const n = Number(count[1]);
    return { personas: Array.from({ length: n }, (_, i) => ({ ...PEOPLE[i % PEOPLE.length], activity: 0.6 + ((i * 7) % 4) / 10, follows_author: i % 4 !== 2 })) };
  }
  const round = prompt.match(/^Round (\d+)\./m);
  if (round) {
    const r = Number(round[1]);
    const actions: unknown[] = [];
    for (const m of prompt.matchAll(/## Person #(\d+): [^(]+\([^,]+, (\w+)\)[\s\S]*?(?=## Person #|JSON shape:)/g)) {
      const id = Number(m[1]);
      const stance = m[2];
      const post = m[0].match(/\[post (\d+)\]/)?.[1];
      if (!post) continue;
      const roll = (id * 31 + r * 17) % 10;
      const lines = LINES[stance] ?? LINES.neutral;
      if (roll < 3) actions.push({ agent_id: id, action: 'like', post_id: Number(post) });
      else if (roll < 5 && r <= 3) actions.push({ agent_id: id, action: 'reply', post_id: Number(post), text: lines[(id + r) % lines.length] });
      else if (roll === 5 && stance !== 'skeptical') actions.push({ agent_id: id, action: 'repost', post_id: Number(post) });
      else if (roll === 6 && stance === 'supportive') actions.push({ agent_id: id, action: 'quote', post_id: Number(post), text: 'Good reminder for anyone shipping AI drafts.' });
    }
    return { actions };
  }
  if (/## Likely reception/.test(prompt)) {
    return {
      markdown:
        '## Likely reception\nMostly positive. Writers and founders like the backwards-reading tip and share it.\n\n## Who engages\nFellow writers repost; data people and researchers reply.\n\n## Pushback\nThe **40%** figure in the second sentence draws most of the pushback: readers want a source.\n\n## Before you post\n- Link the study behind the 40%, or soften it to "many".\n- Add one short example of a fluent but wrong line.\n- Keep the last sentence; it is the part people quote.',
    };
  }
  if (/Someone asks you:/.test(prompt)) return { answer: 'A link to where the 40% comes from. The tip at the end is good, but I will not put my name on a number I cannot check.' };
  return {};
}

export interface ModelCall {
  url: string;
  auth: string | undefined;
  prompt: string;
  json: string | undefined;
}
export type ModelReply = { status?: number; headers?: Record<string, string>; content?: string };

/**
 * An OpenAI-compatible endpoint on 127.0.0.1 that the Python agents call over real HTTP. `reply` picks
 * the answer for each prompt; by default it is the canned `answer` above. Every call is recorded.
 */
export async function startModelServer(reply: (prompt: string, call: number) => ModelReply = (prompt) => ({ content: JSON.stringify(answer(prompt)) }), port = 0) {
  const calls: ModelCall[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
        res.writeHead(404).end();
        return;
      }
      const parsed = JSON.parse(body) as { messages: { content: string }[]; response_format?: { type?: string } };
      const prompt = parsed.messages.map((m) => m.content).join('\n');
      calls.push({ url: req.url, auth: req.headers.authorization, prompt, json: parsed.response_format?.type });
      const r = reply(prompt, calls.length);
      res.writeHead(r.status ?? 200, { 'content-type': 'application/json', ...r.headers }).end(r.content === undefined ? '{}' : JSON.stringify({ choices: [{ message: { content: r.content } }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const { port: bound } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${bound}/v1`, calls, server, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

/** The canned model on a fixed port, for `npm run demo` and trying the app by hand. */
export async function startFakeModel(port = 4199): Promise<Server> {
  return (await startModelServer(undefined, port)).server;
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 4199);
  await startFakeModel(port);
  console.log(`fake model on http://localhost:${port}/v1`);
}
