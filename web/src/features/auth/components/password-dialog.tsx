import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useChangePassword } from '../api';
import { fieldErrors } from '../field-errors';

export function PasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const fields = fieldErrors(change.error);
  const general = change.error && !fields.current_password && !fields.new_password ? errorMessage(change.error) : null;

  const close = (value: boolean) => {
    if (!value) {
      setCurrent('');
      setNext('');
      change.reset();
    }
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Other browsers and devices signed in to this account will be logged out.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            change.mutate(
              { current_password: current, new_password: next },
              {
                onSuccess: () => {
                  toast.success('Password changed. Other devices are logged out.');
                  close(false);
                },
              },
            );
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="current-password">Current password</FieldLabel>
              <Input id="current-password" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} aria-invalid={Boolean(fields.current_password) || undefined} />
              {fields.current_password && <FieldError>{fields.current_password}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="new-password">New password</FieldLabel>
              <Input id="new-password" type="password" autoComplete="new-password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} aria-invalid={Boolean(fields.new_password) || undefined} />
              {fields.new_password ? <FieldError>{fields.new_password}</FieldError> : <FieldDescription>At least 10 characters.</FieldDescription>}
            </Field>
            {general && <FieldError>{general}</FieldError>}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={change.isPending}>
              {change.isPending && <Spinner />}
              Change password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
