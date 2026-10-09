import { isApiError } from '@/api/errors';

/** The server's per-field messages ({ fields: [{ path, message }] }), keyed by field name. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!isApiError(error)) return {};
  const fields = error.details?.fields;
  if (!Array.isArray(fields)) return {};
  return Object.fromEntries(fields.map((f: { path?: string; message?: string }) => [f.path ?? '', f.message ?? '']));
}
