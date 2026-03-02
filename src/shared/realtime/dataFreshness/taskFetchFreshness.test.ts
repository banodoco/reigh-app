import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  paginated: vi.fn(),
  onFetchSuccess: vi.fn(),
  onFetchFailure: vi.fn(),
}));

vi.mock('@/shared/lib/queryKeys/tasks', () => ({
  taskQueryKeys: {
    paginated: mocks.paginated,
  },
}));

vi.mock('@/shared/realtime/DataFreshnessManager', () => ({
  dataFreshnessManager: {
    onFetchSuccess: mocks.onFetchSuccess,
    onFetchFailure: mocks.onFetchFailure,
  },
}));

import {
  notifyPaginatedTaskFetchFailure,
  notifyPaginatedTaskFetchSuccess,
} from './taskFetchFreshness';

describe('taskFetchFreshness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.paginated.mockImplementation((key: string) => `task-key:${key}`);
  });

  it('notifies success with paginated task query key', () => {
    notifyPaginatedTaskFetchSuccess('project-a');

    expect(mocks.paginated).toHaveBeenCalledWith('project-a');
    expect(mocks.onFetchSuccess).toHaveBeenCalledWith('task-key:project-a');
  });

  it('notifies failure with normalized Error instances', () => {
    notifyPaginatedTaskFetchFailure('project-b', new Error('network failed'));

    expect(mocks.onFetchFailure).toHaveBeenCalledWith(
      'task-key:project-b',
      expect.objectContaining({ message: 'network failed' }),
    );
  });

  it('normalizes unknown failure payloads into default error message', () => {
    notifyPaginatedTaskFetchFailure('project-c', { status: 500 });

    expect(mocks.onFetchFailure).toHaveBeenCalledWith(
      'task-key:project-c',
      expect.objectContaining({ message: 'Unknown paginated task fetch failure' }),
    );
  });
});
