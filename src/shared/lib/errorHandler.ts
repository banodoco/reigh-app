/**
 * Centralized error handling utility
 *
 * Provides consistent error handling across the app:
 * - Categorizes errors by type
 * - Logs with structured context
 * - Shows appropriate user feedback via toast
 * - Respects error type-specific behavior (silent errors, auth redirects, etc.)
 */

import { toast } from '@/shared/hooks/use-toast';
import {
  AppError,
  categorizeError,
  isAppError,
  isAuthError,
  isNetworkError,
  SilentError
} from './errors';

export interface HandleErrorOptions {
  /** Context string for logging (e.g., "ImageUpload", "TaskCreation") */
  context: string;
  /** Additional data to include in logs */
  logData?: Record<string, unknown>;
  /** Custom toast title (defaults based on error type) */
  toastTitle?: string;
  /** Override whether to show toast (null = use error's default) */
  showToast?: boolean;
  /** Callback after error is handled */
  onError?: (error: AppError) => void;
}

/**
 * Toast titles by error type
 */
const DEFAULT_TITLES: Record<string, string> = {
  NetworkError: 'Connection Error',
  AuthError: 'Authentication Required',
  ValidationError: 'Invalid Input',
  ServerError: 'Server Error',
  AppError: 'Error',
};

/**
 * Handle an error with consistent logging and user feedback
 *
 * @example
 * ```typescript
 * try {
 *   await uploadImage(file);
 * } catch (error) {
 *   handleError(error, { context: 'ImageUpload', logData: { fileName: file.name } });
 * }
 * ```
 */
export function handleError(error: unknown, options: HandleErrorOptions): AppError {
  const { context, logData, toastTitle, showToast, onError } = options;

  // Categorize the error
  const appError = categorizeError(error, { context, ...logData });

  // Build log tag
  const tag = `[${context}]`;

  // Log the error with context
  if (appError instanceof SilentError) {
    // Silent errors get warn-level logging
    console.warn(`${tag} Silent error:`, appError.message, {
      errorType: appError.name,
      ...appError.context,
    });
  } else {
    // Regular errors get error-level logging
    console.error(`${tag} ${appError.name}:`, appError.message, {
      errorType: appError.name,
      cause: appError.cause?.message,
      ...appError.context,
    });
  }

  // Determine if we should show a toast
  const shouldShowToast = showToast ?? appError.showToast;

  if (shouldShowToast) {
    const title = toastTitle ?? DEFAULT_TITLES[appError.name] ?? DEFAULT_TITLES.AppError;

    // Use the error's message or fall back to a generic message
    let description = appError.message;

    // For network errors, provide more helpful messages
    if (isNetworkError(appError)) {
      if (appError.isOffline) {
        description = 'You appear to be offline. Please check your connection.';
      } else if (appError.isTimeout) {
        description = 'Request timed out. Please try again.';
      }
    }

    toast({
      title,
      description,
      variant: 'destructive',
    });
  }

  // Call optional callback
  onError?.(appError);

  return appError;
}

/**
 * Create a scoped error handler for a specific context
 *
 * @example
 * ```typescript
 * const handleUploadError = createErrorHandler('ImageUpload');
 *
 * try {
 *   await uploadImage(file);
 * } catch (error) {
 *   handleUploadError(error, { logData: { fileName: file.name } });
 * }
 * ```
 */
function createErrorHandler(context: string) {
  return (error: unknown, options?: Omit<HandleErrorOptions, 'context'>): AppError => {
    return handleError(error, { context, ...options });
  };
}

/**
 * Wrap an async function with error handling
 *
 * @example
 * ```typescript
 * const safeUpload = withErrorHandling(
 *   uploadImage,
 *   { context: 'ImageUpload' }
 * );
 *
 * // Errors are automatically handled, returns undefined on failure
 * const result = await safeUpload(file);
 * ```
 */
function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: HandleErrorOptions
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>> | undefined> {
  return async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error, options);
      return undefined;
    }
  };
}

/**
 * Check if an error should trigger a login redirect
 */
function shouldRedirectToLogin(error: unknown): boolean {
  if (isAuthError(error)) {
    return error.needsLogin;
  }
  return false;
}

/**
 * Check if an error is likely transient and worth retrying
 */
function isRetryableError(error: unknown): boolean {
  if (isNetworkError(error)) {
    // Don't retry if offline - wait for connection
    return !error.isOffline;
  }
  // Server errors (5xx) are often transient
  if (isAppError(error) && error.name === 'ServerError') {
    return true;
  }
  return false;
}

// Re-export error types for convenience
export {
  AppError,
  NetworkError,
  AuthError,
  SilentError,
  isAppError,
  isAuthError,
  isNetworkError,
} from './errors';
