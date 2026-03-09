import type { AppError } from './errors';
import {
  reportError,
  type ErrorReportOptions,
} from './coreReporter';
import { presentRuntimeError } from './runtimeErrorPresenter';

export interface RuntimeErrorOptions extends ErrorReportOptions {
  toastTitle?: string;
  showToast?: boolean;
}

/** Normalize unknown errors and route them through the shared presenter. */
export function normalizeAndPresentError(error: unknown, options: RuntimeErrorOptions): AppError {
  const { context, logData, onError, toastTitle, showToast } = options;
  const appError = reportError(error, { context, logData, onError });

  const shouldShowToast = showToast ?? appError.showToast;
  if (shouldShowToast) {
    presentRuntimeError(appError, toastTitle);
  }

  return appError;
}

/** Normalize, present, then throw for caller-level control-flow stops. */
export function normalizeAndPresentAndRethrow(error: unknown, options: RuntimeErrorOptions): never {
  throw normalizeAndPresentError(error, options);
}
