import { beforeEach, describe, expect, it, vi } from 'vitest';
import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';
import {
  notifyPaginatedTaskFetchFailure,
  notifyPaginatedTaskFetchSuccess,
} from './taskFetchFreshness';

const mocks = vi.hoisted(() => ({
  onFetchSuccess: vi.fn(),
  onFetchFailure: vi.fn(),
}));

vi.mock('@/shared/realtime/DataFreshnessManager', () => ({
  dataFreshnessManager: {
    onFetchSuccess: (...args: unknown[]) => mocks.onFetchSuccess(...args),
    onFetchFailure: (...args: unknown[]) => mocks.onFetchFailure(...args),
  },
}));

describe('taskFetchFreshness', () => {
  beforeEach(() => {
    mocks.onFetchSuccess.mockReset();
    mocks.onFetchFailure.mockReset();
  });

  it('reports paginated task fetch success for the correct project cache key', () => {
    notifyPaginatedTaskFetchSuccess('project-1');

    expect(mocks.onFetchSuccess).toHaveBeenCalledWith(
      taskQueryKeys.paginated('project-1'),
    );
  });

  it('normalizes unknown failures into Error instances before reporting them', () => {
    notifyPaginatedTaskFetchFailure('project-1', { message: 'Request blew up' });
    notifyPaginatedTaskFetchFailure('project-2', null);

    expect(mocks.onFetchFailure).toHaveBeenNthCalledWith(
      1,
      taskQueryKeys.paginated('project-1'),
      new Error('Request blew up'),
    );
    expect(mocks.onFetchFailure).toHaveBeenNthCalledWith(
      2,
      taskQueryKeys.paginated('project-2'),
      new Error('Unknown paginated task fetch failure'),
    );
  });
});
