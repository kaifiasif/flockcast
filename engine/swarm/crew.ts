/**
 * The studio crew: small agents that read a finished rehearsal and help fix the post. Like the launch
 * crew, each has one job and a name; the web app gives each a Pip sticker. The work is Python
 * (agents/flockcast_agents/studio); these names are the single source so results and UI agree.
 */
export const STUDIO_AGENTS = {
  sniffer: { name: 'Sable the Sniffer', job: 'Flags the sentences that read as AI-written, and says what gives each away.' },
  editor: { name: 'Editor Ember', job: 'Explains why readers pushed back on a sentence and suggests a rewrite.' },
  contrarian: { name: 'Rook the Contrarian', job: 'Sits in every crowd as the harsh critic, so a friendly crowd cannot hide a weak claim.' },
  herald: { name: 'Echo the Herald', job: 'Picks the replies you are likely to get first and drafts your answers.' },
  wren: { name: 'Wren', job: 'Gives a quick read in one pass when you do not need the full crowd.' },
} as const;
export type StudioAgent = keyof typeof STUDIO_AGENTS;
