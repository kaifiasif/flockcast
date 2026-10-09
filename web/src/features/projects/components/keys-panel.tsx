import { CheckIcon, CopyIcon, KeyRoundIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/errors';
import type { ApiKey, Project } from '@/api/types';
import { EmptyState } from '@/components/shared/empty-state';
import { QueryView } from '@/components/shared/query-view';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { formatDate, formatRelative } from '@/lib/format';
import { useApiKeys, useCreateKey, useRevokeKey } from '../api';

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => toast.error('Copy did not work here. Select the text and copy it instead.'),
        )
      }
    >
      {copied ? <CheckIcon /> : <CopyIcon />} {copied ? 'Copied' : label}
    </Button>
  );
}

function CreateKeyDialog({ project, open, onOpenChange }: { project: Project; open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useCreateKey(project.id);
  const [name, setName] = useState('');
  const secret = create.data?.secret;
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      create.reset();
      setName('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        {secret ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl font-bold tracking-tight">Copy your key now</DialogTitle>
              <DialogDescription>This is the only time Flockcast shows it. Only a fingerprint is stored, so a lost key cannot be recovered; make a new one instead.</DialogDescription>
            </DialogHeader>
            <div className="rounded-2xl border bg-background p-4 font-mono text-[13px] break-all text-foreground">{secret}</div>
            <DialogFooter>
              <CopyButton text={secret} label="Copy key" />
              <Button onClick={() => close(false)}>I saved it</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(name);
            }}
            className="grid gap-5"
          >
            <DialogHeader>
              <DialogTitle className="font-display text-2xl font-bold tracking-tight">New API key</DialogTitle>
              <DialogDescription>The key can start and read rehearsals for {project.name}, and nothing else.</DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="key-name">Where it will be used</FieldLabel>
              <Input id="key-name" required maxLength={60} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="My app" />
              <FieldDescription>So you know which key to revoke later.</FieldDescription>
              {create.error && <FieldError>{errorMessage(create.error)}</FieldError>}
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending && <Spinner />}
                Create key
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function KeyRow({ k, onRevoke }: { k: ApiKey; onRevoke: () => void }) {
  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
      <KeyRoundIcon className="size-4 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{k.name}</p>
        <p className="font-mono text-xs text-muted-foreground">{k.prefix}…</p>
      </div>
      <p className="text-sm text-muted-foreground">
        Made {formatDate(k.created_at)}
        {k.revoked_at ? `, revoked ${formatRelative(k.revoked_at)}` : k.last_used_at ? `, used ${formatRelative(k.last_used_at)}` : ', never used'}
      </p>
      {k.revoked_at ? (
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">Revoked</span>
      ) : (
        <Button variant="outline" size="sm" onClick={onRevoke}>
          Revoke
        </Button>
      )}
    </li>
  );
}

export function KeysPanel({ project }: { project: Project }) {
  const keys = useApiKeys(project.id);
  const revoke = useRevokeKey(project.id);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const base = `${location.origin}/api/v1`;
  const example = `curl ${base}/rehearsals \\
  -H "Authorization: Bearer $FLOCKCAST_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Your draft", "subject": "draft-42"}'`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl">API keys</h2>
            <p className="text-sm text-body">Let any other app, script or CI job rehearse posts and ask for launch advice in this project.</p>
          </div>
          <Button onClick={() => setCreating(true)}>New API key</Button>
        </div>
        <QueryView query={keys} loading={<Skeleton className="h-32 rounded-3xl" />}>
          {(list) =>
            list.length ? (
              <ul className="divide-y rounded-3xl border bg-card">
                {list.map((k) => (
                  <KeyRow key={k.id} k={k} onRevoke={() => setRevoking(k)} />
                ))}
              </ul>
            ) : (
              <EmptyState pip="caster" title="No keys yet" description="Make one for each app that should rehearse posts here, so you can revoke them one at a time." />
            )
          }
        </QueryView>
      </section>
      <aside className="h-fit space-y-4 rounded-3xl border bg-band p-6">
        <h3 className="text-lg">Calling the API</h3>
        <p className="text-sm text-body">
          Send the key as a bearer token. Start a rehearsal, then read it back until its status is <code className="font-mono text-[0.85em]">done</code>. A subject groups reruns of the same draft.
        </p>
        <pre className="overflow-x-auto rounded-2xl bg-foreground p-4 font-mono text-[12px] leading-relaxed text-[#E7E6E5]">
          <code>{example}</code>
        </pre>
        <CopyButton text={example} label="Copy example" />
        <ul className="space-y-1 text-sm text-body">
          <li>
            <code className="font-mono text-[0.85em]">GET /api/v1/rehearsals/:id</code> reads one
          </li>
          <li>
            <code className="font-mono text-[0.85em]">POST /api/v1/rehearsals/:id/interview</code> asks a follower
          </li>
        </ul>
      </aside>
      <CreateKeyDialog project={project} open={creating} onOpenChange={setCreating} />
      <AlertDialog open={Boolean(revoking)} onOpenChange={(open) => !open && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {revoking?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Anything using this key stops working at once. Its past rehearsals stay.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                revoking &&
                revoke.mutate(revoking.id, {
                  onSuccess: () => toast.success('Key revoked'),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              Revoke key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
