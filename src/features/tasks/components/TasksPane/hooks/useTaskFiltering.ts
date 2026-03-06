import { useMemo } from 'react';
import { type PaginatedTasksResponse } from '@/shared/hooks/tasks/useTasks';
import { IncomingTask } from '@/shared/contexts/IncomingTasksContext';
import { filterVisibleTasks } from '@/shared/lib/taskConfig';
import { Task } from '@/types/tasks';
import { FilterGroup } from '../constants';

interface StatusCounts {
  processing: number;
  recentSuccesses: number;
  recentFailures: number;
}

interface UseTaskFilteringArgs {
  tasks: Task[];
  incomingTasks: IncomingTask[];
  activeFilter: FilterGroup;
  statusCounts: StatusCounts | undefined;
  paginatedData?: PaginatedTasksResponse;
}

interface UseTaskFilteringResult {
  filteredTasks: Task[];
  visibleIncomingTasks: IncomingTask[];
  summaryMessage: string | null;
  knownEmptyProcessing: boolean;
  emptyMessage: string;
}

function getEmptyMessage(activeFilter: FilterGroup): string {
  switch (activeFilter) {
    case 'Processing':
      return 'No tasks processing';
    case 'Succeeded':
      return 'No tasks succeeded';
    case 'Failed':
      return 'No tasks failed';
    default:
      return 'No tasks found';
  }
}

export function useTaskFiltering({
  tasks,
  incomingTasks,
  activeFilter,
  statusCounts,
  paginatedData,
}: UseTaskFilteringArgs): UseTaskFilteringResult {
  const filteredTasks = useMemo(() => filterVisibleTasks(tasks), [tasks]);

  const visibleIncomingTasks = useMemo(() => {
    if (activeFilter !== 'Processing' || incomingTasks.length === 0) {
      return [];
    }

    const realTaskIds = new Set(filteredTasks.map((task) => task.id));
    return incomingTasks.filter((incomingTask) => {
      if (incomingTask.taskIds?.length) {
        return !incomingTask.taskIds.some((id) => realTaskIds.has(id));
      }
      return true;
    });
  }, [activeFilter, filteredTasks, incomingTasks]);

  const summaryMessage = useMemo(() => {
    if (!statusCounts) {
      return null;
    }

    if (paginatedData && paginatedData.totalPages > 1) {
      return null;
    }

    if (activeFilter === 'Succeeded' && statusCounts.recentSuccesses > 0) {
      return `${statusCounts.recentSuccesses} succeeded in the past hour.`;
    }

    if (activeFilter === 'Failed' && statusCounts.recentFailures > 0) {
      return `${statusCounts.recentFailures} fails in the past hour.`;
    }

    return null;
  }, [activeFilter, paginatedData, statusCounts]);

  return {
    filteredTasks,
    visibleIncomingTasks,
    summaryMessage,
    knownEmptyProcessing: activeFilter === 'Processing' && statusCounts?.processing === 0,
    emptyMessage: getEmptyMessage(activeFilter),
  };
}
