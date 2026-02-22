import { toast } from '@/shared/hooks/use-toast';
import { AppError } from '@/shared/lib/errors';
import {
  getErrorDescription,
  getErrorTitle,
  logAppError,
} from '@/shared/lib/errorHandling/errorPresentation';
import { normalizeAppError } from '@/shared/lib/errorHandling/errorNormalization';

export interface HandleErrorOptions {
  context: string;
  logData?: Record<string, unknown>;
  toastTitle?: string;
  showToast?: boolean;
  onError?: (error: AppError) => void;
}

/**
 * Normalize, log, and optionally toast an error.
 *
 * @returns The normalized AppError — use when you need the error for
 * conditional handling or chaining. Safe to ignore for fire-and-forget usage.
 */
export function handleError(error: unknown, options: HandleErrorOptions): AppError {
  const { context, logData, toastTitle, showToast, onError } = options;
  const appError = normalizeAppError(error, { context, logData });
  logAppError(context, appError);

  const shouldShowToast = showToast ?? appError.showToast;
  if (shouldShowToast) {
    toast({
      title: getErrorTitle(appError, toastTitle),
      description: getErrorDescription(appError),
      variant: 'destructive',
    });
  }

  onError?.(appError);
  return appError;
}
