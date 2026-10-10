import { CheckIcon, CopyIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { RehearsalResult, StudioAgent } from '@/api/types';
import { Pip } from '@/components/brand/pip';
import type { StudioVariant } from '@/components/brand/pip-art';
import { Button } from '@/components/ui/button';
import { useAppConfig } from '@/features/projects/api';
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

const STICKER: Record<StudioAgent, StudioVariant> = { sniffer: 'sniffer', editor: 'editor', contrarian: 'contrarian', herald: 'herald', wren: 'wren' };

/** One studio agent with its name, at the head of the section it wrote. Names come from the server. */
export function StudioByline({ agent, children }: { agent: StudioAgent; children?: React.ReactNode }) {
  const info = useAppConfig().data?.studio.agents[agent];
  return (
    <div className="flex items-center gap-3">
      <Pip variant={STICKER[agent]} className="size-14 shrink-0" tilt={-6} />
      <div className="min-w-0">
        <p className="font-display text-lg font-bold leading-tight text-foreground">{info?.name}</p>
        <p className="text-sm text-muted-foreground">{children ?? info?.job}</p>
      </div>
    </div>
  );
}

function CopyButton({ text, what }: { text: string; what: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          },
          () => toast.error('Could not copy. Select the text and copy it yourself.'),
        )
      }
    >
      {done ? <CheckIcon /> : <CopyIcon />}
      {done ? 'Copied' : `Copy ${what}`}
    </Button>
  );
}

/** Shown above the results when the crowd agreed with everything: a friendly crowd proves little. */
export function CrowdWarning({ x }: { x: RehearsalResult }) {
  if (!x.crowd?.warning) return null;
  return (
    <div className="flex items-start gap-3 rounded-3xl border border-primary/30 bg-brand-soft px-5 py-4 text-sm text-foreground">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
      <p>{x.crowd.warning}</p>
    </div>
  );
}

export function Fixes({ x }: { x: RehearsalResult }) {
  if (!x.fixes?.length) return null;
  return (
    <section className="space-y-4 rounded-3xl border bg-card p-6 md:p-8">
      <StudioByline agent="editor">{x.fixes.some((f) => f.rewrite) ? 'Why readers balked, and a rewrite for each line.' : 'Why readers balked, and what to change. Add a model key for rewrites.'}</StudioByline>
      <ol className="space-y-4">
        {x.fixes.map((f, i) => (
          <li key={i} className="rounded-2xl border bg-background p-4 md:p-5">
            <p className="text-[16px] leading-relaxed text-foreground line-through decoration-primary/60 decoration-2">{f.sentence}</p>
            <p className="mt-2 text-sm text-body">{f.why}</p>
            {f.said.length > 0 && (
              <ul className="mt-3 space-y-1.5 border-l-2 border-primary/40 pl-4 text-sm text-body">
                {f.said.map((s, j) => (
                  <li key={j}>
                    “{s}”{f.who[j] && <span className="text-muted-foreground">, {f.who[j]}</span>}
                  </li>
                ))}
              </ul>
            )}
            {f.rewrite ? (
              <div className="mt-4 rounded-2xl bg-support-soft p-4">
                <p className="label-mono text-support">Try this</p>
                <p className="mt-1 text-[16px] leading-relaxed text-foreground">{f.rewrite}</p>
                <div className="mt-3">
                  <CopyButton text={f.rewrite} what="rewrite" />
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm font-medium text-foreground">{f.suggestion}</p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function AiCheck({ x }: { x: RehearsalResult }) {
  const ai = x.ai_check;
  if (!ai) return null;
  return (
    <section className="space-y-4 rounded-3xl border bg-card p-6">
      <StudioByline agent="sniffer">
        {ai.flags.length ? `${formatPercent(ai.score / 100)} of your sentences read as AI-written.` : 'Nothing here reads as AI-written.'}
        {ai.method === 'rules' && ' Checked against common tells, without a model.'}
      </StudioByline>
      {ai.flags.length > 0 && (
        <ul className="space-y-3">
          {ai.flags.map((f) => (
            <li key={f.index} className="text-sm">
              <p className="text-foreground">“{f.sentence}”</p>
              <p className="mt-0.5 text-muted-foreground">{f.why}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PlatformChecks({ x, platformName }: { x: RehearsalResult; platformName: string }) {
  if (!x.checks) return null;
  return (
    <section className="space-y-4 rounded-3xl border bg-card p-6">
      <div>
        <h2 className="text-xl">{platformName} rules</h2>
        <p className="mt-1 text-sm text-body">{x.checks.length ? 'Things the platform or its readers tend to punish.' : 'Nothing breaks the usual rules on this platform.'}</p>
      </div>
      {x.checks.length > 0 && (
        <ul className="space-y-3">
          {x.checks.map((c) => (
            <li key={c.id} className="flex gap-3 text-sm">
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', c.level === 'warn' ? 'bg-primary' : 'bg-muted-foreground/50')} aria-hidden />
              <div>
                <p className="font-medium text-foreground">
                  {c.title}
                  <span className="sr-only">{c.level === 'warn' ? ' (warning)' : ' (tip)'}</span>
                </p>
                <p className="text-body">{c.detail}</p>
                {c.excerpt && <p className="mt-1 text-muted-foreground">“{c.excerpt}”</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ReplyPrep({ x }: { x: RehearsalResult }) {
  if (!x.reply_prep?.length) return null;
  return (
    <section className="space-y-4">
      <StudioByline agent="herald">The replies you are likely to get first, with an answer ready for each. Fill in anything in brackets.</StudioByline>
      <ul className="grid gap-3 md:grid-cols-2">
        {x.reply_prep.map((r, i) => (
          <li key={i} className="flex flex-col gap-3 rounded-3xl border bg-card p-5 text-sm">
            <p className="text-body">
              <span className="font-semibold text-foreground">{r.from}</span>: “{r.reply}”
            </p>
            <div className="rounded-2xl bg-background p-3">
              <p className="label-mono">Your answer</p>
              <p className="mt-1 text-[15px] text-foreground">{r.answer}</p>
            </div>
            <div>
              <CopyButton text={r.answer} what="answer" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
