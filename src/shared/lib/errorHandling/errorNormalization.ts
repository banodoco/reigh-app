import { AppError, categorizeError } from '@/shared/lib/errors';

interface ErrorNormalizationOptions {
  context: string;
  logData?: Record<string, unknown>;
}

/**
 * Normalize unknown errors into AppError with structured context.
 * Keep this pure so presentation layers can decide logging/toast behavior.
 */
export function normalizeAppError(
  error: unknown,
  options: ErrorNormalizationOptions
): AppError {
  const { context, logData } = options;
  return categorizeError(error, { context, ...logData });
}
