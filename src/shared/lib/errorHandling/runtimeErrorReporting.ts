import type { AppError } from '@/shared/lib/errorHandling/errors';
import {
  reportError,
  type ErrorReportOptions,
} from '@/shared/lib/errorHandling/coreReporter';

/**
 * Infra-safe error normalization/logging facade with no UI side effects.
 */
export type RuntimeErrorLogOptions = ErrorReportOptions;

export function normalizeAndLogError(
  error: unknown,
  options: RuntimeErrorLogOptions,
): AppError {
  const { context, logData, onError } = options;
  return reportError(error, { context, logData, onError });
}

/** @deprecated Use normalizeAndLogError. */
export const normalizeAndReportError = normalizeAndLogError;
