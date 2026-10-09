import { useState } from 'react';
import { errorMessage, isApiError } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useLogin } from '../api';
import { CodeInput } from './code-input';

/**
 * Email and password, then (only for accounts with 2-step codes on) a second step for the code.
 * The server says which: a right password on such an account answers MFA_REQUIRED.
 */
export function LoginForm({ onSignUp }: { onSignUp?: () => void }) {
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const needsCode = isApiError(login.error, 'MFA_REQUIRED') || (code.length > 0 && login.isError);

  const submit = (withCode?: string) => login.mutate({ email, password, ...(withCode ? { code: withCode } : {}) });
  const error = login.error && !isApiError(login.error, 'MFA_REQUIRED') ? errorMessage(login.error) : null;

  if (needsCode) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(code);
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="login-code">Code from your authenticator app</FieldLabel>
            <CodeInput id="login-code" value={code} onChange={setCode} onComplete={submit} invalid={Boolean(error)} autoFocus />
            <FieldDescription>Open the app you set up for Flockcast and enter the 6 digits it shows now.</FieldDescription>
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <Field>
            <Button type="submit" disabled={code.length !== 6 || login.isPending}>
              {login.isPending && <Spinner />}
              Log in
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setCode('');
                login.reset();
              }}
            >
              Use a different account
            </Button>
          </Field>
        </FieldGroup>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="login-email">Email</FieldLabel>
          <Input id="login-email" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="login-password">Password</FieldLabel>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(error) || undefined}
          />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <Field>
          <Button type="submit" disabled={login.isPending}>
            {login.isPending && <Spinner />}
            Log in
          </Button>
          {onSignUp && (
            <FieldDescription className="text-center">
              New here?{' '}
              <button type="button" className="underline underline-offset-4" onClick={onSignUp}>
                Create an account
              </button>
            </FieldDescription>
          )}
        </Field>
      </FieldGroup>
    </form>
  );
}
