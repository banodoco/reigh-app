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
  isNetworkError,
  SilentError
} from './errors';

interface HandleErrorOptions {
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
