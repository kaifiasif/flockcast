import { RehearsalError } from '../../../engine/index.ts';
import { AppError, ErrorCode } from '../../core/errors.ts';

const CODES: Record<RehearsalError['code'], ErrorCode> = {
  NOT_FOUND: ErrorCode.NOT_FOUND,
  INVALID: ErrorCode.VALIDATION_FAILED,
  UNKNOWN_SOURCE: ErrorCode.VALIDATION_FAILED,
  GATE_CLOSED: ErrorCode.INVALID_STATE,
  NOT_READY: ErrorCode.INVALID_STATE,
  NO_INTERVIEWS: ErrorCode.INVALID_STATE,
  RATE_LIMITED: ErrorCode.RATE_LIMITED,
  MODEL_FAILED: ErrorCode.MODEL_FAILED,
};

/** Engine refusals become AppErrors with the app's codes. All are 4xx, so people see the message. */
export async function engineCall<T>(work: () => T | Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof RehearsalError) throw new AppError(e.status, CODES[e.code], e.message);
    throw e;
  }
}
