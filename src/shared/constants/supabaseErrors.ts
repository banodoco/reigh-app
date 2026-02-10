/**
 * Supabase/PostgreSQL error code constants.
 *
 * These error codes appear in the `code` field of Supabase error responses.
 * Using constants makes the codebase more maintainable and searchable.
 */

export const SUPABASE_ERROR = {
  /**
   * PGRST116: No rows found.
   * Returned when a query expected to find rows but found none.
   * Often used with `.single()` or `.maybeSingle()` queries.
   */
  NOT_FOUND: 'PGRST116',

  /**
   * 23505: Unique constraint violation.
   * Returned when trying to insert a duplicate value in a unique column.
   */
  UNIQUE_VIOLATION: '23505',

  /**
   * 42883: Function does not exist.
   * Returned when calling an RPC function that doesn't exist.
   */
  FUNCTION_NOT_FOUND: '42883',
} as const;

type SupabaseErrorCode = typeof SUPABASE_ERROR[keyof typeof SUPABASE_ERROR];

/**
 * Type guard for objects with a `code` property.
 */
function isErrorWithCode(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error;
}

/**
 * Check if an error is a "not found" error (PGRST116).
 * Safe to call with any error type.
 */
export function isNotFoundError(error: unknown): boolean {
  return isErrorWithCode(error) && error.code === SUPABASE_ERROR.NOT_FOUND;
}

/**
 * Check if an error is a unique constraint violation (23505).
 * Safe to call with any error type.
 */
export function isUniqueViolationError(error: unknown): boolean {
  return isErrorWithCode(error) && error.code === SUPABASE_ERROR.UNIQUE_VIOLATION;
}
