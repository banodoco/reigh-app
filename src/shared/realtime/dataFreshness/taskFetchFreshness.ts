import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';
import { dataFreshnessManager } from '@/shared/realtime/DataFreshnessManager';

function normalizeToError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return new Error(message);
    }
  }
  return new Error('Unknown paginated task fetch failure');
}

export function notifyPaginatedTaskFetchSuccess(cacheProjectKey: string): void {
  dataFreshnessManager.onFetchSuccess(taskQueryKeys.paginated(cacheProjectKey));
}

export function notifyPaginatedTaskFetchFailure(cacheProjectKey: string, error: unknown): void {
  dataFreshnessManager.onFetchFailure(taskQueryKeys.paginated(cacheProjectKey), normalizeToError(error));
}
