import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { z } from 'zod';
import { AppError, ErrorCode } from '../core/errors.ts';

/** Turns zod issues into one readable sentence plus a field-by-field list for the UI. */
export function validationError(error: Pick<z.core.$ZodError, 'issues'>): AppError {
  const fields = error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  const first = fields[0];
  const message = first ? (first.path ? `${first.path}: ${first.message}` : first.message) : 'Invalid request.';
  return new AppError(400, ErrorCode.VALIDATION_FAILED, message, { fields });
}

/**
 * Request validation at the boundary. Past this point handlers receive typed, trusted values
 * and services never re-check what the schema already guarantees.
 */
export const validate = <Target extends keyof ValidationTargets, Schema extends z.ZodType>(target: Target, schema: Schema) =>
  zValidator(target, schema, (result) => {
    if (!result.success) throw validationError(result.error);
  });
