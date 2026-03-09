import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/types/tasks';
import { useTaskListPresentationState } from './useTaskListPresentationState';

const FILTER_STATUSES = ['Queued', 'In Progress'] as const;

function makeTask(id: string, createdAt: string): Task {
  return {
    id,
    createdAt,
  } as unknown as Task;
}

describe('useTaskListPresentationState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-08T12:00:00.000Z'));
  });

  it('marks filter transitions and settles once tasks load or timeout elapses', () => {
    const { result, rerender } = renderHook(
      (props: {
        activeFilter: 'Processing' | 'Succeeded' | 'Failed';
        tasks: Task[];
        isLoading: boolean;
      }) =>
        useTaskListPresentationState({
          tasks: props.tasks,
          activeFilter: props.activeFilter,
          filterStatuses: FILTER_STATUSES,
          currentPage: 1,
          isLoading: props.isLoading,
        }),
      {
        initialProps: { activeFilter: 'Processing', tasks: [], isLoading: false },
      },
    );

    expect(result.current.isFilterTransitioning).toBe(false);

    rerender({ activeFilter: 'Failed', tasks: [], isLoading: false });
    expect(result.current.isFilterTransitioning).toBe(true);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.isFilterTransitioning).toBe(false);

    rerender({ activeFilter: 'Succeeded', tasks: [], isLoading: true });
    expect(result.current.isFilterTransitioning).toBe(true);

    rerender({
      activeFilter: 'Succeeded',
      tasks: [makeTask('task-1', '2026-03-08T11:59:59.000Z')],
      isLoading: false,
    });
    expect(result.current.isFilterTransitioning).toBe(false);
  });

  it('highlights newly added recent tasks and clears highlight after flash window', () => {
    const oldTask = makeTask('task-old', '2026-03-08T11:59:00.000Z');
    const recentTask = makeTask('task-new', '2026-03-08T11:59:59.500Z');
    const pageTwoTask = makeTask('task-page-2', '2026-03-08T11:59:59.800Z');

    const { result, rerender } = renderHook(
      (props: { tasks: Task[]; currentPage: number }) =>
        useTaskListPresentationState({
          tasks: props.tasks,
          activeFilter: 'Processing',
          filterStatuses: FILTER_STATUSES,
          currentPage: props.currentPage,
          isLoading: false,
        }),
      {
        initialProps: { tasks: [oldTask], currentPage: 1 },
      },
    );

    expect(result.current.newTaskIds.size).toBe(0);

    // Prime the hook after its page/filter reset effect.
    rerender({ tasks: [oldTask], currentPage: 1 });

    rerender({ tasks: [oldTask, recentTask], currentPage: 1 });
    expect(result.current.newTaskIds.has('task-new')).toBe(true);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.newTaskIds.size).toBe(0);

    rerender({ tasks: [oldTask, recentTask, pageTwoTask], currentPage: 2 });
    expect(result.current.newTaskIds.size).toBe(0);
  });
});
