import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/errors';
import type { Project } from '@/api/types';
import { CopyButton } from '@/components/shared/copy-button';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { formatRelative } from '@/lib/format';
import { useCreateWebhook, useDeleteWebhook, useTestWebhook, useWebhooks } from './api';

const EVENTS = [
  ['rehearsal.finished', 'A rehearsal finished or failed'],
  ['approval.requested', 'Someone asked for approval'],
  ['approval.decided', 'A reviewer decided'],
] as const;
type Event = (typeof EVENTS)[number][0];

/** Signed webhooks for the project's own tools: Slack bridges, schedulers, internal dashboards. */
export function WebhooksPanel({ project }: { project: Project }) {
  const hooks = useWebhooks(project.id);
  const create = useCreateWebhook(project.id);
  const remove = useDeleteWebhook(project.id);
  const test = useTestWebhook(project.id);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<Event[]>(['rehearsal.finished']);
  const secret = create.data?.secret;

  return (
    <section className="grid gap-4" aria-label="Webhooks">
      <div>
        <h2 className="text-xl">Webhooks</h2>
        <p className="mt-1 text-sm text-body">Flockcast posts JSON to your URL when something happens, signed with a secret so you can check it came from here.</p>
      </div>
      {(hooks.data ?? []).length > 0 && (
        <ul className="divide-y overflow-hidden rounded-3xl border bg-card">
          {hooks.data!.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-6 py-4">
              <div className="min-w-0 flex-1 basis-64">
                <p className="truncate font-mono text-[13px] text-foreground">{h.url}</p>
                <p className="text-xs text-muted-foreground">
                  {h.events.join(', ')}
                  {h.last_at ? `. Last sent ${formatRelative(h.last_at)}: ${h.last_error ?? `answered ${h.last_status}`}` : '. Not sent yet'}
                </p>
              </div>
              <Button variant="outline" size="sm" disabled={test.isPending} onClick={() => test.mutate(h.id, { onSuccess: (d) => (d.error ? toast.error(d.error) : toast.success(`Delivered, answered ${d.status}`)) })}>
                Send test
              </Button>
              <Button variant="ghost" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(h.id, { onError: (e) => toast.error(errorMessage(e)) })}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
      {secret ? (
        <div className="grid gap-2 rounded-3xl border bg-band p-6">
          <p className="font-medium text-foreground">Copy the signing secret now; it is not shown again.</p>
          <div className="rounded-2xl border bg-card p-3 font-mono text-[12px] break-all text-foreground">{secret}</div>
          <p className="text-xs text-body">
            Each delivery has a <code>Flockcast-Signature: t=…,v1=…</code> header: the HMAC-SHA256 of <code>t.body</code> with this secret.
          </p>
          <div className="flex gap-2">
            <CopyButton text={secret} label="Copy secret" />
            <Button size="sm" onClick={() => create.reset()}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="grid gap-4 rounded-3xl border bg-card p-6"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ url, events }, { onSuccess: () => setUrl('') });
          }}
        >
          <Field>
            <FieldLabel htmlFor="hook-url">Endpoint URL</FieldLabel>
            <Input id="hook-url" type="url" required maxLength={500} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/flockcast" />
            <FieldDescription>Must be https and reachable from the internet.</FieldDescription>
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium text-foreground">Send when</legend>
            {EVENTS.map(([id, label]) => (
              <label key={id} className="flex items-center gap-2 text-sm text-body">
                <Checkbox checked={events.includes(id)} onCheckedChange={(on) => setEvents(on ? [...events, id] : events.filter((x) => x !== id))} />
                {label}
              </label>
            ))}
          </fieldset>
          {create.error && <FieldError>{errorMessage(create.error)}</FieldError>}
          <Button type="submit" className="w-fit" disabled={create.isPending || !events.length}>
            {create.isPending && <Spinner />}
            Add webhook
          </Button>
        </form>
      )}
    </section>
  );
}
