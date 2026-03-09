import type { AppError } from './errors';
import { getErrorDescription, getErrorTitle } from './errorPresentation';
import { emitErrorNotification } from './errorNotifier';

export function notifyError(appError: AppError, toastTitle?: string): boolean {
  return emitErrorNotification({
    appError,
    title: getErrorTitle(appError, toastTitle),
    description: getErrorDescription(appError),
  });
}
