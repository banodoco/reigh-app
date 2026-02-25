import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

export function runOptimisticCacheUpdate(operation: () => void, context: string): void {
  try {
    operation();
  } catch (error) {
    normalizeAndPresentError(error, {
      context,
      showToast: false,
    });
  }
}
