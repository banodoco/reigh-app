import { AppError } from './errors';
import { normalizeAndLogError } from '@/shared/lib/errorHandling/normalizeAndLogError';

/** @publicContract Runtime error normalization/logging facade. */
export interface ErrorReportOptions {
  context: string;
  logData?: Record<string, unknown>;
  onError?: (error: AppError) => void;
}

/** Normalize and log only. Does not trigger toast side effects. */
export function reportError(error: unknown, options: ErrorReportOptions): AppError {
  const { context, logData, onError } = options;
  const appError = normalizeAndLogError(error, { context, logData });
  onError?.(appError);
  return appError;
}

export function reportAndRethrow(error: unknown, options: ErrorReportOptions): never {
  throw reportError(error, options);
}
