import { useState } from 'react';
import { errorMessage, isApiError } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useSignup } from '../api';
import { fieldErrors } from '../field-errors';

const MIN_PASSWORD = 10;

/** There is no email-based reset, so the password is typed twice. */
export function SignupForm({ onLogIn }: { onLogIn?: () => void }) {
  const signup = useSignup();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);

  const mismatch = touched && confirm.length > 0 && confirm !== password;
  const fields = fieldErrors(signup.error);
  const exists = isApiError(signup.error, 'ACCOUNT_EXISTS');
  const general = signup.error && !fields.email && !fields.password ? errorMessage(signup.error) : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (password === confirm) signup.mutate({ email, password });
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="signup-email">Email</FieldLabel>
          <Input
            id="signup-email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(fields.email || exists) || undefined}
          />
          {fields.email && <FieldError>{fields.email}</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor="signup-password">Password</FieldLabel>
          <Input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(fields.password) || undefined}
          />
          {fields.password ? <FieldError>{fields.password}</FieldError> : <FieldDescription>At least {MIN_PASSWORD} characters. A short sentence works well.</FieldDescription>}
        </Field>
        <Field>
          <FieldLabel htmlFor="signup-confirm">Type it again</FieldLabel>
          <Input
            id="signup-confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={mismatch || undefined}
          />
          {mismatch && <FieldError>The two passwords are different.</FieldError>}
        </Field>
        <Field>
          {general && <FieldError>{general}</FieldError>}
          <Button type="submit" disabled={signup.isPending}>
            {signup.isPending && <Spinner />}
            Create account
          </Button>
          {onLogIn && (
            <FieldDescription className="text-center">
              Already have an account?{' '}
              <button type="button" className="underline underline-offset-4" onClick={onLogIn}>
                Log in
              </button>
            </FieldDescription>
          )}
        </Field>
      </FieldGroup>
    </form>
  );
}
