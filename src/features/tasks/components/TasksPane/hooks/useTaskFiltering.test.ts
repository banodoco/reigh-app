import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { IncomingTask } from '@/shared/contexts/IncomingTasksContext';
import type { Task } from '@/types/tasks';
import { useTaskFiltering } from './useTaskFiltering';

const mocks = vi.hoisted(() => ({
  filterVisibleTasks: vi.fn(),
}));

vi.mock('@/shared/lib/taskConfig', () => ({
  filterVisibleTasks: (...args: unknown[]) => mocks.filterVisibleTasks(...args),
}));

function makeTask(id: string): Task {
  return { id } as unknown as Task;
}

function makeIncoming(id: string, taskIds?: string[]): IncomingTask {
  return {
    id,
    startedAt: new Date(),
    taskType: 'generate',
    label: id,
    taskIds,
  };
}

describe('useTaskFiltering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.filterVisibleTasks.mockImplementation((tasks: Task[]) => tasks);
  });

  it('filters visible incoming processing tasks against existing real task IDs', () => {
    const tasks = [makeTask('task-1'), makeTask('task-2')];
    const incomingTasks = [
      makeIncoming('incoming-1', ['task-1']),
      makeIncoming('incoming-2', ['task-3']),
      makeIncoming('incoming-3'),
    ];

    const { result } = renderHook(() =>
      useTaskFiltering({
        tasks,
        incomingTasks,
        activeFilter: 'Processing',
        statusCounts: {
          processing: 0,
          recentSuccesses: 1,
          recentFailures: 1,
        },
      }),
    );

    expect(mocks.filterVisibleTasks).toHaveBeenCalledWith(tasks);
    expect(result.current.filteredTasks).toEqual(tasks);
    expect(result.current.visibleIncomingTasks.map((item) => item.id)).toEqual([
      'incoming-2',
      'incoming-3',
    ]);
    expect(result.current.knownEmptyProcessing).toBe(true);
    expect(result.current.emptyMessage).toBe('No tasks processing');
  });

  it('computes summary messages by filter and suppresses summary for paginated views', () => {
    const { result, rerender } = renderHook(
      (props: { activeFilter: 'Succeeded' | 'Failed'; totalPages?: number }) =>
        useTaskFiltering({
          tasks: [makeTask('task-1')],
          incomingTasks: [],
          activeFilter: props.activeFilter,
          statusCounts: {
            processing: 1,
            recentSuccesses: 3,
            recentFailures: 2,
          },
          paginatedData: props.totalPages ? ({ totalPages: props.totalPages } as never) : undefined,
        }),
      {
        initialProps: { activeFilter: 'Succeeded' as const, totalPages: undefined },
      },
    );

    expect(result.current.summaryMessage).toBe('3 succeeded in the past hour.');
    expect(result.current.emptyMessage).toBe('No tasks succeeded');

    rerender({ activeFilter: 'Failed', totalPages: 2 });
    expect(result.current.summaryMessage).toBeNull();
    expect(result.current.emptyMessage).toBe('No tasks failed');
  });
});
