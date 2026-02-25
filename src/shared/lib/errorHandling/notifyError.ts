import type { AppError } from './errors';
import { getErrorDescription, getErrorTitle } from '@/shared/lib/errorHandling/errorPresentation';
import { emitErrorNotification } from '@/shared/lib/errorHandling/errorNotifier';

export function notifyError(appError: AppError, toastTitle?: string): boolean {
  return emitErrorNotification({
    appError,
    title: getErrorTitle(appError, toastTitle),
    description: getErrorDescription(appError),
  });
}
