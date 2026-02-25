import type { AppError } from './errors';
import { normalizeAppError } from '@/shared/lib/errorHandling/errorNormalization';
import { logAppError } from '@/shared/lib/errorHandling/errorPresentation';

interface NormalizeAndLogOptions {
  context: string;
  logData?: Record<string, unknown>;
}

export function normalizeAndLogError(
  error: unknown,
  { context, logData }: NormalizeAndLogOptions,
): AppError {
  const appError = normalizeAppError(error, { context, logData });
  logAppError(context, appError);
  return appError;
}
