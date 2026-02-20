import { AppError, isNetworkError, SilentError } from '@/shared/lib/errors';

const DEFAULT_ERROR_TITLES: Record<string, string> = {
  NetworkError: 'Connection Error',
  AuthError: 'Authentication Required',
  ValidationError: 'Invalid Input',
  ServerError: 'Server Error',
  AppError: 'Error',
};

export function logAppError(context: string, appError: AppError): void {
  if (appError instanceof SilentError) {
    return;
  }

  const tag = `[${context}]`;
  console.error(`${tag} ${appError.name}:`, appError.message, {
    errorType: appError.name,
    cause: appError.cause?.message,
    ...appError.context,
  });
}

export function getErrorTitle(appError: AppError, override?: string): string {
  return override ?? DEFAULT_ERROR_TITLES[appError.name] ?? DEFAULT_ERROR_TITLES.AppError;
}

export function getErrorDescription(appError: AppError): string {
  if (!isNetworkError(appError)) {
    return appError.message;
  }

  if (appError.isOffline) {
    return 'You appear to be offline. Please check your connection.';
  }

  if (appError.isTimeout) {
    return 'Request timed out. Please try again.';
  }

  return appError.message;
}
