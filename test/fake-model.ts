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

function answer(prompt: string): unknown {
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

export function startFakeModel(port = 4199): Promise<Server> {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
        res.writeHead(404).end();
        return;
      }
      const { messages } = JSON.parse(body) as { messages: { content: string }[] };
      const content = JSON.stringify(answer(messages.map((m) => m.content).join('\n')));
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 4199);
  await startFakeModel(port);
  console.log(`fake model on http://localhost:${port}/v1`);
}
