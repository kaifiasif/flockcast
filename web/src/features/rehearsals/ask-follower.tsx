import { useState } from 'react';
import { errorMessage } from '@/api/errors';
import type { Rehearsal } from '@/api/types';
import { Pip } from '@/components/brand/pip';
import { pipFor } from '@/components/brand/pip-for';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useAppConfig } from '@/features/projects/api';
import { cn } from '@/lib/utils';
import { useAskFollower } from './api';

const STANCE = { supportive: 'on your side', skeptical: 'skeptical', neutral: 'undecided' } as const;
const SUGGESTIONS = ['What would make you repost this?', 'Which sentence lost you?', 'What did you expect me to say next?'];

/** Pick a follower from the crowd and ask them anything. They answer from what they saw and did. */
export function AskFollower({ rehearsal, projectId }: { rehearsal: Rehearsal; projectId: string }) {
  const x = rehearsal.result!;
  const config = useAppConfig();
  const ask = useAskFollower(projectId, rehearsal.id);
  const [chosen, setChosen] = useState(x.personas[0]?.id ?? 1);
  const [question, setQuestion] = useState('');
  const canAsk = x.engine !== 'swarm-offline' && config.data?.engine.interviews !== false;
  const persona = x.personas.find((p) => p.id === chosen);
  const thread = rehearsal.interviews.filter((i) => i.agent_id === chosen);
  const left = (config.data?.limits.interviewsPerRehearsal ?? 25) - rehearsal.interviews.length;

  const send = (prompt: string) => {
    if (!prompt.trim()) return;
    ask.mutate({ agent_id: chosen, prompt: prompt.trim() }, { onSuccess: () => setQuestion('') });
  };

  return (
    <section className="rounded-3xl border bg-card p-6 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl">Ask a follower</h2>
          <p className="mt-1 text-sm text-body">
            {canAsk ? 'Each follower remembers what they saw and did in this rehearsal.' : 'This rehearsal ran as an offline estimate, so its followers cannot answer. Add a model key to the server and run it again.'}
          </p>
        </div>
        {canAsk && <p className="text-sm text-muted-foreground">{left > 0 ? `${left} questions left on this rehearsal` : 'No questions left on this rehearsal'}</p>}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ul className="grid max-h-[420px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-1" aria-label="The crowd">
          {x.personas.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setChosen(p.id)}
                aria-pressed={p.id === chosen}
                className={cn('flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-colors', p.id === chosen ? 'border-primary/50 bg-brand-soft/60' : 'border-transparent hover:bg-background')}
              >
                <Pip variant={pipFor(p)} className="size-10" />
                <span className="min-w-0 text-sm leading-tight">
                  <span className="block truncate font-semibold text-foreground">{p.name}</span>
                  <span className="block truncate text-muted-foreground">
                    {p.segment}, {STANCE[p.stance]}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="flex min-h-[320px] flex-col rounded-3xl bg-background p-4 md:p-5">
          {persona && (
            <div className="flex items-center gap-3 border-b pb-3">
              <Pip variant={pipFor(persona)} className="size-12" />
              <p className="text-sm text-body">
                <span className="font-semibold text-foreground">{persona.name}.</span> {persona.bio}
              </p>
            </div>
          )}
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto py-4" aria-live="polite">
            {thread.length === 0 && !ask.isPending && <p className="m-auto max-w-[36ch] text-center text-sm text-muted-foreground">{canAsk ? `Ask ${persona?.name ?? 'them'} why they reacted the way they did.` : 'Questions are off for offline rehearsals.'}</p>}
            {thread.map((i, n) => (
              <div key={n} className="space-y-2">
                <p className="ml-auto w-fit max-w-[85%] rounded-3xl rounded-br-md bg-foreground px-4 py-2 text-[15px] text-background">{i.prompt}</p>
                <p className="w-fit max-w-[85%] rounded-3xl rounded-bl-md border bg-card px-4 py-2 text-[15px] text-body">{i.answer}</p>
              </div>
            ))}
            {ask.isPending && (
              <p className="inline-flex w-fit items-center gap-2 rounded-3xl rounded-bl-md border bg-card px-4 py-2 text-sm text-muted-foreground">
                <Spinner className="size-3.5" /> {persona?.name} is thinking
              </p>
            )}
          </div>
          {canAsk && (
            <>
              {thread.length === 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} disabled={ask.isPending || left <= 0} className="rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-body hover:border-primary/40 hover:text-foreground disabled:opacity-50">
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  send(question);
                }}
              >
                <Input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={1000} placeholder={`Ask ${persona?.name ?? 'a follower'} a question`} aria-label="Your question" disabled={left <= 0} />
                <Button type="submit" disabled={ask.isPending || !question.trim() || left <= 0}>
                  Ask
                </Button>
              </form>
              {ask.error && <FieldError className="mt-2">{errorMessage(ask.error)}</FieldError>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
