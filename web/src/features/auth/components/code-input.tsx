import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp';

/** The 6-digit code from an authenticator app. Submits on its own once all six digits are in. */
export function CodeInput({ id, value, onChange, onComplete, invalid, autoFocus }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (code: string) => void;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <InputOTP
      id={id}
      maxLength={6}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus={autoFocus}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      aria-invalid={invalid || undefined}
    >
      <InputOTPGroup>
        {[0, 1, 2].map((i) => (
          <InputOTPSlot key={i} index={i} aria-invalid={invalid || undefined} />
        ))}
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        {[3, 4, 5].map((i) => (
          <InputOTPSlot key={i} index={i} aria-invalid={invalid || undefined} />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
