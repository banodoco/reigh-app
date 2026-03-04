import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  operationFailure,
  operationSuccess,
  type OperationResult,
} from '@/shared/lib/operationResult';

export function runOptimisticCacheUpdate(
  operation: () => void,
  context: string,
): OperationResult<void> {
  try {
    operation();
    return operationSuccess(undefined, { policy: 'best_effort' });
  } catch (error) {
    normalizeAndPresentError(error, {
      context,
      showToast: false,
    });

    return operationFailure(error, {
      policy: 'degrade',
      errorCode: 'reference_optimistic_cache_update_failed',
      message: 'Failed to update cached reference selection',
      recoverable: true,
      cause: { context },
    });
  }
}
