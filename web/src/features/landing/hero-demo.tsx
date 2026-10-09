import { HeartIcon, MessageCircleIcon, Repeat2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Pip, type PipVariant } from '@/components/brand/pip';
import { cn } from '@/lib/utils';

/** The landing page's one orchestrated moment: a post meets its crowd, and the pushback lands on one sentence. */
const SENTENCES = [
  'Most AI drafts go wrong in the second sentence, not the first.',
  'Reviewers skim fluent lines, and 40% of factual errors hide right there.',
  'Read your draft backwards before you post it.',
];

const REPLIES: { pip: PipVariant; name: string; segment: string; text: string; pushback: boolean }[] = [
  { pip: 'skeptic', name: 'Maya', segment: 'Data people', text: 'Where is the 40% from? I would want the study before I repost this.', pushback: true },
  { pip: 'fan', name: 'Jon', segment: 'Fellow writers', text: 'Reading drafts backwards is such a good trick. Stealing it.', pushback: false },
  { pip: 'newcomer', name: 'Ade', segment: 'New here', text: 'What counts as a fluent line? An example would help.', pushback: false },
  { pip: 'analyst', name: 'Lena', segment: 'Researchers', text: 'The second sentence does a lot of work for a number with no source.', pushback: true },
];

const COUNTS = [
  { likes: 0, reposts: 0 },
  { likes: 4, reposts: 0 },
  { likes: 11, reposts: 3 },
  { likes: 14, reposts: 4 },
  { likes: 18, reposts: 5 },
];

const STEP_MS = 900;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function HeroDemo() {
  const [step, setStep] = useState(() => (reducedMotion() ? REPLIES.length : 0));
  useEffect(() => {
    if (step >= REPLIES.length) return;
    const t = setTimeout(() => setStep((s) => s + 1), step === 0 ? 700 : STEP_MS);
    return () => clearTimeout(t);
  }, [step]);
  const done = step >= REPLIES.length;
  const counts = COUNTS[step];

  return (
    <div className="relative mx-auto w-full max-w-[520px]" aria-label="Example rehearsal: four simulated followers reply to a post" role="img">
      <div className="rounded-3xl border bg-card p-5 shadow-[0_30px_80px_-40px_rgb(28_25_23/0.35)] sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-band font-display text-sm font-bold text-foreground">you</span>
          <div className="min-w-0 leading-tight">
            <p className="font-semibold text-foreground">You</p>
            <p className="text-sm text-muted-foreground">@you · draft, not posted</p>
          </div>
          <span className="label-mono ml-auto">Rehearsal</span>
        </div>
        <p className="mt-4 text-[17px] leading-relaxed text-foreground">
          {SENTENCES.map((s, i) => (
            <span key={i} className={cn('transition-[text-decoration-color] duration-700', i === 1 && 'pushback', i === 1 && !done && '[text-decoration-color:transparent]')} style={i === 1 ? ({ '--share': 0.7 } as React.CSSProperties) : undefined}>
              {s}{' '}
            </span>
          ))}
        </p>
        <div className="mt-4 flex items-center gap-5 border-t pt-3 text-sm text-muted-foreground tabular-nums">
          <span className="inline-flex items-center gap-1.5">
            <MessageCircleIcon className="size-4" /> {step}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Repeat2Icon className="size-4" /> {counts.reposts}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <HeartIcon className="size-4" /> {counts.likes}
          </span>
          <span className={cn('ml-auto rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand transition-opacity duration-500', done ? 'opacity-100' : 'opacity-0')}>
            2 of 4 replies push back on sentence 2
          </span>
        </div>
      </div>

      <ol className="relative mt-3 space-y-2.5 pl-5 sm:pl-10">
        {REPLIES.slice(0, step).map((r) => (
          <li key={r.name} className="arrive flex items-start gap-3 rounded-2xl border bg-card p-3 pr-4">
            <Pip variant={r.pip} className="-mt-1.5 -ml-1.5 size-12" />
            <div className="min-w-0 text-sm">
              <p className="leading-tight">
                <span className="font-semibold text-foreground">{r.name}</span> <span className="text-muted-foreground">{r.segment}</span>
                {r.pushback && <span className="ml-2 rounded-full bg-brand-soft px-2 py-px text-[11px] font-medium text-brand">pushback</span>}
              </p>
              <p className="mt-1 text-body">{r.text}</p>
            </div>
          </li>
        ))}
        {/* hold the height so the page does not jump while replies arrive */}
        {REPLIES.slice(step).map((r) => (
          <li key={r.name} aria-hidden className="invisible flex items-start gap-3 rounded-2xl border p-3 pr-4">
            <span className="size-11" />
            <div className="text-sm">
              <p>{r.name}</p>
              <p className="mt-1">{r.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
