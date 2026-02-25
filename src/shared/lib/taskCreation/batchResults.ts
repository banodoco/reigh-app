import { AppError } from '@/shared/lib/errorHandling/errors';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { TaskCreationResult } from './types';

/**
 * Processes batch Promise.allSettled results with standard error handling.
 *
 * - Throws if every task failed (surfaces the first error).
 * - Logs individual failures when some succeed.
 * - Returns the fulfilled TaskCreationResult values.
 */
export function processBatchResults(
  results: PromiseSettledResult<TaskCreationResult>[],
  context: string,
): TaskCreationResult[] {
  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  if (successful === 0) {
    const firstError = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    const reasonError = firstError.reason instanceof Error
      ? firstError.reason
      : new Error(String(firstError.reason));
    throw new AppError(`All batch tasks failed: ${reasonError.message}`, {
      cause: reasonError,
      context: { context },
    });
  }

  if (failed > 0) {
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        normalizeAndPresentError(result.reason, { context: `${context}:task${index + 1}`, showToast: false });
      }
    });
  }

  return results
    .filter((r): r is PromiseFulfilledResult<TaskCreationResult> => r.status === 'fulfilled')
    .map(r => r.value);
}
