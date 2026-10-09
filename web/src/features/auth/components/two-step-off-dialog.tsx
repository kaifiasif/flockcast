import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useDisableMfa } from '../api';
import { fieldErrors } from '../field-errors';
import { CodeInput } from './code-input';

/** Turning protection off asks for both factors, so a borrowed laptop alone cannot do it. */
export function TwoStepOffDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const disable = useDisableMfa();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const fields = fieldErrors(disable.error);
  const general = disable.error && !fields.password && !fields.code ? errorMessage(disable.error) : null;

  const close = () => {
    setPassword('');
    setCode('');
    disable.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Turn off 2-step codes</DialogTitle>
          <DialogDescription>Your password alone will be enough to log in again.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            disable.mutate(
              { password, code },
              {
                onSuccess: () => {
                  toast.success('2-step codes are off.');
                  close();
                },
              },
            );
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="off-password">Password</FieldLabel>
              <Input id="off-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(fields.password) || undefined} />
              {fields.password && <FieldError>{fields.password}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="off-code">Code from your authenticator app</FieldLabel>
              <CodeInput id="off-code" value={code} onChange={setCode} invalid={Boolean(fields.code)} />
              {fields.code && <FieldError>{fields.code}</FieldError>}
            </Field>
            {general && <FieldError>{general}</FieldError>}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={!password || code.length !== 6 || disable.isPending}>
              {disable.isPending && <Spinner />}
              Turn off
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
