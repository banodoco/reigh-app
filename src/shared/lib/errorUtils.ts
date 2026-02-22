/**
 * Type guard for Error instances
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Type guard for errors with a code property (e.g., Supabase errors)
 */
interface ErrorWithCode extends Error {
  code?: string;
}

export function isErrorWithCode(value: unknown): value is ErrorWithCode {
  return isError(value) && 'code' in value;
}

/**
 * Type guard for errors with status (e.g., HTTP errors)
 */
interface ErrorWithStatus extends Error {
  status?: number;
}

export function isErrorWithStatus(value: unknown): value is ErrorWithStatus {
  return isError(value) && typeof (value as ErrorWithStatus).status === 'number';
}

/**
 * Safely extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

/**
 * Check if error is an abort/timeout error
 */
export function isAbortError(error: unknown): boolean {
  return isError(error) && error.name === 'AbortError';
}

/**
 * Check if error is a cancellation error (abort, cancelled request, etc.)
 */
export function isCancellationError(error: unknown): boolean {
  if (!isError(error)) return false;
  return error.name === 'AbortError' ||
         error.message?.includes('Request was cancelled') ||
         error.message?.includes('signal is aborted');
}

// ============================================================================
// Supabase error utilities
// Re-export from supabaseErrors.ts for convenience
// ============================================================================

export { SUPABASE_ERROR } from '@/shared/constants/supabaseErrors';
// Note: isErrorWithCode is defined above for Error instances.
// For Supabase errors (plain objects), use functions from supabaseErrors.ts directly.
