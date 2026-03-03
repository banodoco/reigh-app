import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTasksPaneController } from './useTasksPaneController';
import { usePaginatedTasks } from '@/shared/hooks/tasks/useTasks';
import { useAllTaskTypes, useTaskStatusCounts } from '@/shared/hooks/tasks/useTaskStatusCounts';
import { useTasksPaneViewState } from './useTasksPaneViewState';
import { useTasksPaneCancelPending } from './useTasksPaneCancelPending';

vi.mock('@/shared/hooks/tasks/useTasks', () => ({
  usePaginatedTasks: vi.fn(),
}));

vi.mock('@/shared/hooks/tasks/useTaskStatusCounts', () => ({
  useTaskStatusCounts: vi.fn(),
  useAllTaskTypes: vi.fn(),
}));

vi.mock('@/shared/lib/taskConfig', () => ({
  getTaskDisplayName: (taskType: string) => `Label ${taskType}`,
}));

vi.mock('./useTasksPaneViewState', () => ({
  useTasksPaneViewState: vi.fn(),
}));

vi.mock('./useTasksPaneCancelPending', () => ({
  useTasksPaneCancelPending: vi.fn(),
}));

describe('useTasksPaneController', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useTasksPaneViewState).mockReturnValue({
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
    });

    vi.mocked(usePaginatedTasks).mockReturnValue({
      data: { data: [{ id: 'task-1' }], total: 25 },
      isLoading: false,
    } as never);

    vi.mocked(useTaskStatusCounts).mockReturnValue({
      data: {
        processing: 7,
        degraded: false,
        failedQueries: [],
      },
      isLoading: false,
    } as never);

    vi.mocked(useAllTaskTypes).mockReturnValue({
      data: ['travel_segment', 'join_clips_segment'],
    } as never);

    vi.mocked(useTasksPaneCancelPending).mockReturnValue({
      handleCancelAllPending: vi.fn(),
      isCancelAllPending: false,
    });
  });

  it('returns derived pagination and task-type option data', () => {
    const { result } = renderHook(() =>
      useTasksPaneController({
        selectedProjectId: 'project-1',
        projects: [
          { id: 'project-1', name: 'Project One' },
          { id: 'project-2', name: 'Project Two' },
        ],
        incomingTasks: [],
        cancelAllIncoming: vi.fn(),
      }),
    );

    expect(result.current.totalTasks).toBe(25);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.cancellableTaskCount).toBe(25);
    expect(result.current.isAllProjectsMode).toBe(false);
    expect(result.current.projectNameMap).toEqual({
      'project-1': 'Project One',
      'project-2': 'Project Two',
    });
    expect(result.current.taskTypeOptions).toEqual([
      { value: 'join_clips_segment', label: 'Label join_clips_segment' },
      { value: 'travel_segment', label: 'Label travel_segment' },
    ]);
  });
});
