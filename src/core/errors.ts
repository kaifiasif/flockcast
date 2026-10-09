/**
 * Errors that cross the HTTP boundary.
 *
 * Every failure a caller can cause has a stable `code` the UI can branch on. The HTTP status says
 * whose fault it was (4xx: the caller, 5xx: us); the code says which rule was broken.
 */

export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** the password was right; the 6-digit code from the authenticator app is still needed */
  MFA_REQUIRED: 'MFA_REQUIRED',
  ACCOUNT_EXISTS: 'ACCOUNT_EXISTS',
  /** a signed-in user re-entered their password or a code, and it was wrong */
  WRONG_CREDENTIALS: 'WRONG_CREDENTIALS',
  SIGNUP_CLOSED: 'SIGNUP_CLOSED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_STATE: 'INVALID_STATE',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  /** the model provider failed or refused; the message says why */
  MODEL_FAILED: 'MODEL_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, code: ErrorCode, message: string, details?: Record<string, unknown>, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isClientError(): boolean {
    return this.status < 500;
  }
}

export const badRequest = (message: string, details?: Record<string, unknown>) => new AppError(400, ErrorCode.VALIDATION_FAILED, message, details);
export const notFound = (what: string) => new AppError(404, ErrorCode.NOT_FOUND, `${what} not found.`);
export const conflict = (message: string, details?: Record<string, unknown>, code: ErrorCode = ErrorCode.INVALID_STATE) =>
  new AppError(409, code, message, details);
