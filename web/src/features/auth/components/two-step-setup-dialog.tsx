import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useEnableMfa, useStartMfaSetup } from '../api';
import { CodeInput } from './code-input';
import { QrCode } from './qr-code';

/** Scan, then prove the app has the secret by typing one code. Nothing changes until that code checks out. */
export function TwoStepSetupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const setup = useStartMfaSetup();
  const enable = useEnableMfa();
  const [code, setCode] = useState('');

  // a fresh secret each time the dialog opens
  useEffect(() => {
    if (open) setup.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per opening
  }, [open]);

  const close = () => {
    setCode('');
    setup.reset();
    enable.reset();
    onOpenChange(false);
  };
  const confirm = (value: string) =>
    enable.mutate(value, {
      onSuccess: () => {
        toast.success('2-step codes are on. You will be asked for one each time you log in.');
        close();
      },
    });

  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Turn on 2-step codes</DialogTitle>
          <DialogDescription>Scan this with an authenticator app such as Google Authenticator, 1Password or Authy.</DialogDescription>
        </DialogHeader>
        {setup.isError ? (
          <FieldError>{errorMessage(setup.error)}</FieldError>
        ) : !setup.data ? (
          <Skeleton className="mx-auto size-44" />
        ) : (
          <form
            className="grid gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              confirm(code);
            }}
          >
            <div className="grid justify-items-center gap-3">
              <QrCode value={setup.data.otpauth_uri} label="QR code for your authenticator app" className="size-44 rounded-md border" />
              <p className="text-center text-xs text-muted-foreground">
                Cannot scan? Enter this key by hand:
                <span className="mt-1 block font-mono text-sm tracking-wider break-all text-foreground select-all">{setup.data.secret.match(/.{1,4}/g)?.join(' ')}</span>
              </p>
            </div>
            <Field>
              <FieldLabel htmlFor="setup-code">Code the app shows</FieldLabel>
              <CodeInput id="setup-code" value={code} onChange={setCode} onComplete={confirm} invalid={enable.isError} autoFocus />
              {enable.isError ? <FieldError>{errorMessage(enable.error)}</FieldError> : <FieldDescription>It changes every 30 seconds.</FieldDescription>}
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={code.length !== 6 || enable.isPending}>
                {enable.isPending && <Spinner />}
                Turn on
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
