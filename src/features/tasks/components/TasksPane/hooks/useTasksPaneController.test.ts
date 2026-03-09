import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ITEMS_PER_PAGE, STATUS_GROUPS } from '../constants';
import { useTasksPaneController } from './useTasksPaneController';

const mocks = vi.hoisted(() => ({
  usePaginatedTasks: vi.fn(),
  useTaskStatusCounts: vi.fn(),
  useAllTaskTypes: vi.fn(),
  getTaskDisplayName: vi.fn(),
  useTasksPaneViewState: vi.fn(),
  useTasksPaneCancelPending: vi.fn(),
}));

vi.mock('@/shared/hooks/tasks/useTasks', () => ({
  usePaginatedTasks: (...args: unknown[]) => mocks.usePaginatedTasks(...args),
}));

vi.mock('@/shared/hooks/tasks/useTaskStatusCounts', () => ({
  useTaskStatusCounts: (...args: unknown[]) => mocks.useTaskStatusCounts(...args),
  useAllTaskTypes: (...args: unknown[]) => mocks.useAllTaskTypes(...args),
}));

vi.mock('@/shared/lib/taskConfig', () => ({
  getTaskDisplayName: (...args: unknown[]) => mocks.getTaskDisplayName(...args),
}));

vi.mock('./useTasksPaneViewState', () => ({
  useTasksPaneViewState: (...args: unknown[]) => mocks.useTasksPaneViewState(...args),
}));

vi.mock('./useTasksPaneCancelPending', () => ({
  useTasksPaneCancelPending: (...args: unknown[]) => mocks.useTasksPaneCancelPending(...args),
}));

function buildViewState(overrides: Record<string, unknown> = {}) {
  return {
    selectedFilter: 'Processing',
    selectedTaskType: null,
    projectScope: 'current',
    currentPage: 1,
    mobileActiveTaskId: null,
    setProjectScope: vi.fn(),
    setMobileActiveTaskId: vi.fn(),
    handleFilterChange: vi.fn(),
    handleTaskTypeChange: vi.fn(),
    handlePageChange: vi.fn(),
    handleStatusIndicatorClick: vi.fn(),
    ...overrides,
  };
}

describe('useTasksPaneController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usePaginatedTasks.mockReturnValue({
      data: { tasks: [], total: 0, hasMore: false, totalPages: 0 },
      isLoading: false,
    });
    mocks.useTaskStatusCounts.mockReturnValue({
      data: {
        processing: 0,
        recentSuccesses: 0,
        recentFailures: 0,
        degraded: false,
        failedQueries: [],
      },
      isLoading: false,
    });
    mocks.useAllTaskTypes.mockReturnValue({ data: [] });
    mocks.getTaskDisplayName.mockImplementation((value: string) => value);
    mocks.useTasksPaneViewState.mockReturnValue(buildViewState());
    mocks.useTasksPaneCancelPending.mockReturnValue({
      handleCancelAllPending: vi.fn(),
      isCancelAllPending: false,
    });
  });

  it('derives all-project query params and computed values for processing filter', () => {
    const handleCancelAllPending = vi.fn();
    mocks.useTasksPaneViewState.mockReturnValue(buildViewState({
      selectedFilter: 'Processing',
      selectedTaskType: 'z_type',
      projectScope: 'all',
      currentPage: 3,
      mobileActiveTaskId: 'mobile-1',
    }));
    mocks.usePaginatedTasks.mockReturnValue({
      data: { tasks: [], total: 120, hasMore: false, totalPages: 3 },
      isLoading: true,
    });
    mocks.useTaskStatusCounts.mockReturnValue({
      data: {
        processing: 4,
        recentSuccesses: 2,
        recentFailures: 1,
        degraded: true,
        failedQueries: ['processing', 'failure'],
      },
      isLoading: false,
    });
    mocks.useAllTaskTypes.mockReturnValue({ data: ['z_type', 'a_type'] });
    mocks.getTaskDisplayName.mockImplementation((taskType: string) =>
      taskType === 'z_type' ? 'Zebra' : 'Alpha',
    );
    mocks.useTasksPaneCancelPending.mockReturnValue({
      handleCancelAllPending,
      isCancelAllPending: true,
    });

    const input = {
      selectedProjectId: 'project-1',
      projects: [
        { id: 'project-1', name: 'First' },
        { id: 'project-2', name: 'Second' },
      ],
      incomingTasks: [
        {},
        { expectedCount: 3 },
        { taskIds: ['resolved'] },
      ],
      cancelAllIncoming: vi.fn(),
    };

    const { result } = renderHook(() => useTasksPaneController(input));

    expect(mocks.usePaginatedTasks).toHaveBeenCalledWith({
      projectId: null,
      status: STATUS_GROUPS.Processing,
      limit: ITEMS_PER_PAGE,
      offset: 100,
      taskType: 'z_type',
      allProjects: true,
      allProjectIds: ['project-1', 'project-2'],
    });
    expect(mocks.useTaskStatusCounts).toHaveBeenCalledWith('project-1');
    expect(mocks.useAllTaskTypes).toHaveBeenCalledWith('project-1');
    expect(mocks.useTasksPaneCancelPending).toHaveBeenCalledWith({
      selectedProjectId: 'project-1',
      selectedFilter: 'Processing',
      currentPage: 3,
      cancelAllIncoming: input.cancelAllIncoming,
    });

    expect(result.current.taskTypeOptions).toEqual([
      { value: 'a_type', label: 'Alpha' },
      { value: 'z_type', label: 'Zebra' },
    ]);
    expect(result.current.totalTasks).toBe(120);
    expect(result.current.totalPages).toBe(3);
    expect(result.current.cancellableTaskCount).toBe(124);
    expect(result.current.effectiveProjectId).toBeNull();
    expect(result.current.isAllProjectsMode).toBe(true);
    expect(result.current.projectNameMap).toEqual({
      'project-1': 'First',
      'project-2': 'Second',
    });
    expect(result.current.isStatusCountsDegraded).toBe(true);
    expect(result.current.failedStatusQueries).toBe('processing, failure');
    expect(result.current.handleCancelAllPending).toBe(handleCancelAllPending);
    expect(result.current.isCancelAllPending).toBe(true);
  });

  it('keeps prior status counts while loading, then updates once fresh counts settle', () => {
    const statusPayload = {
      data: {
        processing: 7,
        recentSuccesses: 1,
        recentFailures: 0,
        degraded: false,
        failedQueries: [] as string[],
      },
      isLoading: false,
    };
    mocks.useTasksPaneViewState.mockReturnValue(buildViewState({
      selectedFilter: 'Succeeded',
      projectScope: 'current',
      currentPage: 1,
    }));
    mocks.useTaskStatusCounts.mockImplementation(() => statusPayload);

    const { result, rerender } = renderHook(() =>
      useTasksPaneController({
        selectedProjectId: 'project-9',
        projects: [{ id: 'project-9', name: 'Ninth' }],
        incomingTasks: [{ expectedCount: 2 }],
        cancelAllIncoming: vi.fn(),
      }),
    );

    expect(result.current.displayStatusCounts?.processing).toBe(7);
    expect(result.current.cancellableTaskCount).toBe(9);
    expect(result.current.isStatusCountsDegraded).toBe(false);
    expect(result.current.failedStatusQueries).toBe('');

    statusPayload.data = {
      processing: 99,
      recentSuccesses: 2,
      recentFailures: 1,
      degraded: true,
      failedQueries: ['success'],
    };
    statusPayload.isLoading = true;
    rerender();

    expect(result.current.displayStatusCounts?.processing).toBe(7);
    expect(result.current.cancellableTaskCount).toBe(9);
    expect(result.current.isStatusCountsDegraded).toBe(false);
    expect(result.current.failedStatusQueries).toBe('');

    statusPayload.isLoading = false;
    rerender();

    expect(result.current.displayStatusCounts?.processing).toBe(99);
    expect(result.current.cancellableTaskCount).toBe(101);
    expect(result.current.isStatusCountsDegraded).toBe(true);
    expect(result.current.failedStatusQueries).toBe('success');
    expect(mocks.usePaginatedTasks).toHaveBeenCalledWith({
      projectId: 'project-9',
      status: STATUS_GROUPS.Succeeded,
      limit: ITEMS_PER_PAGE,
      offset: 0,
      taskType: null,
      allProjects: false,
      allProjectIds: undefined,
    });
  });

  it('disables task loading dependencies when no project is selected', () => {
    mocks.useTasksPaneViewState.mockReturnValue(buildViewState({
      selectedFilter: 'Failed',
      projectScope: 'current',
    }));

    const { result } = renderHook(() =>
      useTasksPaneController({
        selectedProjectId: null,
        projects: [],
        incomingTasks: [],
        cancelAllIncoming: vi.fn(),
      }),
    );

    expect(mocks.useTaskStatusCounts).toHaveBeenCalledWith(null);
    expect(mocks.useAllTaskTypes).toHaveBeenCalledWith(null);
    expect(mocks.usePaginatedTasks).toHaveBeenCalledWith({
      projectId: null,
      status: STATUS_GROUPS.Failed,
      limit: ITEMS_PER_PAGE,
      offset: 0,
      taskType: null,
      allProjects: false,
      allProjectIds: undefined,
    });
    expect(result.current.effectiveProjectId).toBeNull();
    expect(result.current.taskTypeOptions).toEqual([]);
    expect(result.current.totalPages).toBe(0);
    expect(result.current.cancellableTaskCount).toBe(0);
  });
});
