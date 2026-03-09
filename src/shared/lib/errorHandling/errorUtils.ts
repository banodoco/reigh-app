export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

interface ErrorWithCode extends Error {
  code?: string;
}

export function isErrorWithCode(value: unknown): value is ErrorWithCode {
  return isError(value) && 'code' in value;
}

interface ErrorWithStatus extends Error {
  status?: number;
}

export function isErrorWithStatus(value: unknown): value is ErrorWithStatus {
  return isError(value) && typeof (value as ErrorWithStatus).status === 'number';
}

export function getErrorMessage(error: unknown): string {
  if (isError(error)) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

/**
 * Check if error is an abort error (DOMException AbortError or Error with name/message 'abort').
 * Handles DOMException (which may not be instanceof Error in all environments)
 * as well as standard Error instances with AbortError name or abort-related messages.
 */
export function isAbortError(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError';
  }
  if (!isError(error)) {
    return false;
  }
  return error.name === 'AbortError' || error.message.toLowerCase().includes('abort');
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

export { SUPABASE_ERROR } from '../../constants/supabaseErrors';
// Note: isErrorWithCode is defined above for Error instances.
// For Supabase errors (plain objects), use functions from supabaseErrors.ts directly.
