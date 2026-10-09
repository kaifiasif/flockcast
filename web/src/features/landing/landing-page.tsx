import { PLATFORMS } from '@engine/platforms.ts';
import { DownloadIcon, Code2Icon, KeyRoundIcon, LockKeyholeIcon, ServerIcon, ShieldCheckIcon, WifiOffIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { hrefOf } from '@/app/router';
import { Logo } from '@/components/brand/logo';
import { Pip, PIP_VARIANTS, type PipVariant } from '@/components/brand/pip';
import { Button } from '@/components/ui/button';
import { useSession } from '@/features/auth/api';
import { verbPlural } from '@/lib/format';
import { HeroDemo } from './hero-demo';
import { Murmuration } from './murmuration';

const CROWD: PipVariant[] = ['skeptic', 'fan', 'newcomer', 'listener', 'caster', 'analyst'];

const STEPS = [
  { title: 'Paste a draft', body: 'One post, or a thread with "---" between the parts. Pick where it goes: X, LinkedIn, Threads, Bluesky, Reddit or anywhere else.' },
  { title: 'A crowd reads it', body: 'Followers, skeptics and strangers built from your past posts scroll a feed with your draft in it. They like, repost, quote and reply, round after round.' },
  { title: 'See what to fix', body: 'You get the replies, the counts, a report, and each sentence marked by how much pushback it drew. Then ask any follower why.' },
];

function Section({ id, title, intro, children, band = false }: { id?: string; title: string; intro?: ReactNode; children: ReactNode; band?: boolean }) {
  return (
    <section id={id} className={band ? 'border-y bg-band' : undefined}>
      <div className="container-page py-20 md:py-28">
        <div className="max-w-[640px] space-y-3">
          <h2 className="text-3xl md:text-[2.75rem] md:leading-[1.08]">{title}</h2>
          {intro && <p className="text-[17px] text-body">{intro}</p>}
        </div>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}

function TopBar({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="relative z-10">
      <div className="container-page flex h-20 items-center justify-between">
        <a href={hrefOf({ name: 'landing' })} aria-label="Flockcast home">
          <Logo />
        </a>
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          <a href="#how" className="hidden rounded-full px-3 py-1.5 text-sm font-medium text-body hover:text-foreground sm:inline">
            How it works
          </a>
          <a href="#api" className="hidden rounded-full px-3 py-1.5 text-sm font-medium text-body hover:text-foreground sm:inline">
            API
          </a>
          {signedIn ? (
            <Button asChild size="sm">
              <a href={hrefOf({ name: 'projects' })}>Open your projects</a>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost">
                <a href={hrefOf({ name: 'login' })}>Log in</a>
              </Button>
              <Button asChild size="sm">
                <a href={hrefOf({ name: 'signup' })}>Get started</a>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function LandingPage() {
  const signedIn = Boolean(useSession().data?.user);
  const start = signedIn ? hrefOf({ name: 'projects' }) : hrefOf({ name: 'signup' });

  return (
    <div className="min-h-svh">
      <div className="relative overflow-hidden">
        <Murmuration className="pointer-events-none absolute inset-0 h-full w-full" />
        <TopBar signedIn={signedIn} />
        <div className="container-page relative grid items-center gap-14 pt-8 pb-20 md:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:pb-28">
          <div className="max-w-[580px]">
            <h1 className="text-[2.75rem] leading-[1.02] sm:text-6xl lg:text-[4.25rem]">Hear the replies before you post.</h1>
            <p className="mt-6 max-w-[48ch] text-lg text-body">
              Flockcast shows your draft to a simulated crowd of followers, skeptics and strangers. You see who reposts, who pushes back, and the exact sentence they push back on.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <a href={start}>Rehearse a post</a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#how">See how it works</a>
              </Button>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">Open source. Runs on a free model key, or offline with none.</p>
          </div>
          <HeroDemo />
        </div>
      </div>

      <Section id="how" title="A dress rehearsal for every post" intro="Nothing is posted anywhere. The crowd lives on your server and forgets nothing between rounds." band>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-3xl border bg-card p-6">
              <span className="grid size-9 place-items-center rounded-full bg-brand-soft font-display text-sm font-bold text-brand">{i + 1}</span>
              <h3 className="mt-5 text-xl">{s.title}</h3>
              <p className="mt-2 text-[15px] text-body">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Meet the crowd" intro="Every rehearsal casts its own followers from your audience notes and past posts. These are the regulars. Save any of them as a sticker.">
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {CROWD.map((v, i) => (
            <li key={v} className="group flex flex-col items-center rounded-3xl border bg-card px-3 pt-5 pb-4 text-center">
              <Pip variant={v} className="size-28 transition-transform duration-300 group-hover:-rotate-6" tilt={i % 2 ? 4 : -4} />
              <p className="mt-3 font-display font-bold text-foreground">{PIP_VARIANTS[v].label}</p>
              <p className="mt-1 text-sm text-body">{PIP_VARIANTS[v].blurb}</p>
              <a href={`/stickers/pip-${v}.svg`} download className="mt-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground hover:text-brand">
                <DownloadIcon className="size-3.5" /> Sticker
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Tuned to where you post" intro="Reply length, the words for each action and the room's manners change with the platform, so a LinkedIn crowd comments and a Reddit crowd upvotes." band>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.values(PLATFORMS).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-4 rounded-full border bg-card py-3 pr-5 pl-6">
              <span className="font-display font-bold text-foreground">{p.id === 'generic' ? 'Anywhere else' : p.name}</span>
              <span className="text-sm text-muted-foreground">
                {verbPlural(p.verbs.reply)} up to {p.replyChars} characters
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Ask any follower why" intro="Each follower remembers what they saw and did. Ask the skeptic what would change their mind, or the newcomer what lost them.">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-3 rounded-3xl border bg-card p-6">
            <div className="ml-auto w-fit max-w-[85%] rounded-3xl rounded-br-md bg-foreground px-4 py-2.5 text-[15px] text-background">What would make you repost this?</div>
            <div className="flex items-end gap-2">
              <Pip variant="skeptic" className="size-12" />
              <div className="max-w-[85%] rounded-3xl rounded-bl-md border bg-background px-4 py-2.5 text-[15px] text-body">
                A link to where the 40% comes from. The tip at the end is good, but I will not put my name on a number I cannot check.
              </div>
            </div>
            <p className="label-mono pt-2">Maya, data people, replied in round 2</p>
          </div>
          <ul className="space-y-4 text-[15px] text-body">
            <li>
              <strong className="text-foreground">Each sentence gets a pushback score.</strong> Replies are matched back to the sentence they argue with, so you know which line to rewrite.
            </li>
            <li>
              <strong className="text-foreground">Your draft is posted word for word.</strong> The report says so, and says when a run was an offline estimate rather than a model.
            </li>
            <li>
              <strong className="text-foreground">Run it again after an edit.</strong> Same text and settings return the saved result for free; changed text starts a fresh rehearsal.
            </li>
          </ul>
        </div>
      </Section>

      <Section id="api" title="Plug it into your own app" intro="Every project gets API keys, so any app can rehearse a draft or ask for launch advice: your writing tool, your CMS, a script or a CI job." band>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <pre className="overflow-x-auto rounded-3xl bg-foreground p-6 font-mono text-[13px] leading-relaxed text-[#E7E6E5]">
            <code>{`curl https://your-flockcast.example/api/v1/rehearsals \\
  -H "Authorization: Bearer flk_..." \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Your draft here", "subject": "draft-42"}'

# then poll until status is "done"
curl https://your-flockcast.example/api/v1/rehearsals/<id> \\
  -H "Authorization: Bearer flk_..."`}</code>
          </pre>
          <ul className="space-y-3 text-[15px] text-body">
            {[
              { icon: KeyRoundIcon, text: 'A key works for one project only, is shown once and stored as a hash. Revoke it in one click.' },
              { icon: ServerIcon, text: 'Or skip HTTP: import the engine as a library, with your own content source and storage.' },
              { icon: WifiOffIcon, text: 'No key on the server? Rehearsals still run as a clearly labelled offline estimate.' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3 rounded-3xl border bg-card p-4">
                <Icon className="mt-0.5 size-5 shrink-0 text-brand" />
                {text}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title="Free to run, private by default" intro="Bring a free key from Groq, Gemini or OpenRouter, or point it at Ollama on your own machine. Your drafts stay in your own database.">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: LockKeyholeIcon, title: 'Your server, your data', body: 'One SQLite file. Nothing is sent anywhere except the model you choose.' },
            { icon: ShieldCheckIcon, title: 'Locked down accounts', body: 'Hashed passwords, optional 2-step codes, and sign-up closed until you open it.' },
            { icon: KeyRoundIcon, title: 'Keys stay on the server', body: 'The model key never reaches the browser, and API keys are only ever stored hashed.' },
            { icon: Code2Icon, title: 'Open source', body: 'MIT licensed. Read it, run it, change the crowd.' },
          ].map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-3xl border bg-card p-6">
              <Icon className="size-5 text-brand" />
              <h3 className="mt-4 text-lg">{title}</h3>
              <p className="mt-1.5 text-[15px] text-body">{body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <section className="container-page pb-20">
        <div className="relative overflow-hidden rounded-[32px] border bg-card px-6 py-14 text-center md:py-20">
          <div className="pointer-events-none absolute inset-x-0 -bottom-6 flex justify-center gap-2 opacity-90 sm:gap-6" aria-hidden>
            {(['fan', 'skeptic', 'plain', 'listener', 'analyst'] as PipVariant[]).map((v, i) => (
              <Pip key={v} variant={v} className={i === 0 || i === 4 ? 'hidden size-28 sm:block' : 'size-24 sm:size-28'} tilt={[-10, 6, -2, 8, -6][i]} />
            ))}
          </div>
          <div className="relative pb-24 sm:pb-28">
            <h2 className="text-3xl md:text-5xl">Your crowd is waiting.</h2>
            <p className="mx-auto mt-4 max-w-[46ch] text-[17px] text-body">Set up a project in a minute, paste a draft, and read the replies before anyone real does.</p>
            <Button asChild size="lg" className="mt-8">
              <a href={start}>Rehearse a post</a>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="container-page flex flex-col items-start justify-between gap-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <Logo size="sm" />
          <p>Simulated audiences are a rehearsal, not a forecast. Real people will surprise you.</p>
        </div>
      </footer>
    </div>
  );
}
