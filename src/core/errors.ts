import type { LookupErrorCode, LookupFailure } from './result';

/** The only error type providers throw; anything else is treated as an internal bug. */
export class LookupError extends Error {
  override readonly name = 'LookupError';

  constructor(
    readonly code: LookupErrorCode,
    message: string,
    readonly retryAfterSec?: number,
  ) {
    super(message);
  }
}

export function toFailure(error: unknown): LookupFailure {
  if (error instanceof LookupError) {
    return error.retryAfterSec === undefined
      ? { code: error.code, message: error.message }
      : { code: error.code, message: error.message, retryAfterSec: error.retryAfterSec };
  }
  console.error('[4NTL] unexpected lookup error', error);
  return { code: 'internal', message: 'Something went wrong. Please try again.' };
}
