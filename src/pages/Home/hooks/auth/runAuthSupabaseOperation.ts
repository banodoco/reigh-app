import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  operationFailure,
  operationSuccess,
  type OperationFailurePolicy,
  type OperationResult,
} from '@/shared/lib/operationResult';

interface RunAuthSupabaseOperationOptions<T> {
  context: string;
  errorCode: string;
  policy?: OperationFailurePolicy;
  showToast?: boolean;
  toastTitle?: string;
  run: () => Promise<T>;
}

/**
 * Shared auth operation runner so home auth hooks use one error/result policy.
 */
export async function runAuthSupabaseOperation<T>(
  options: RunAuthSupabaseOperationOptions<T>,
): Promise<OperationResult<T>> {
  const {
    context,
    errorCode,
    policy = 'best_effort',
    showToast = false,
    toastTitle,
    run,
  } = options;

  try {
    const value = await run();
    return operationSuccess(value, { policy });
  } catch (error) {
    normalizeAndPresentError(error, {
      context,
      showToast,
      toastTitle,
    });
    return operationFailure(error, {
      policy,
      recoverable: true,
      errorCode,
      cause: error,
    });
  }
}
