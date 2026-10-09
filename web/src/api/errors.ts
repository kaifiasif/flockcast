import type { ErrorCode } from '@server/core/errors.ts';

/** The server's error envelope: { error: { code, message, details? } }. Branch on `code`, show `message`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'NETWORK';
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, code: ErrorCode | 'NETWORK', message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static async fromResponse(res: Response): Promise<ApiError> {
    const body: unknown = await res.json().catch(() => null);
    const error = (body as { error?: { code?: ErrorCode; message?: string; details?: Record<string, unknown> } } | null)?.error;
    return new ApiError(res.status, error?.code ?? 'INTERNAL', error?.message ?? `Request failed (${res.status}).`, error?.details);
  }
}

export const isApiError = (error: unknown, code?: ApiError['code']): error is ApiError =>
  error instanceof ApiError && (code === undefined || error.code === code);

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : 'Something went wrong.');
