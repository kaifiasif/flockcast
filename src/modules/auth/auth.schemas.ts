import { z } from 'zod';

const Email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Enter a valid email address.'));
/** Length is what makes a password strong; the upper bound keeps hashing cost fixed. */
const NewPassword = z.string().min(10, 'Use at least 10 characters.').max(200, 'Use at most 200 characters.');
const AnyPassword = z.string().min(1, 'Enter your password.').max(200);
const Code = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app.');

export const SignupInput = z.object({ email: Email, password: NewPassword });
export const LoginInput = z.object({ email: Email, password: AnyPassword, code: Code.optional() });
export const PasswordChangeInput = z.object({ current_password: AnyPassword, new_password: NewPassword });
export const MfaEnableInput = z.object({ code: Code });
export const MfaDisableInput = z.object({ password: AnyPassword, code: Code });
