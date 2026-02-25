import { useEffect, useRef } from 'react';
import type { Task, TaskStatus } from '@/types/tasks';
import { shouldForceProcessingRefetch } from '@/shared/hooks/tasks/taskFetchPolicy';

interface ProcessingRefetchQueryState {
  data?: { tasks: Task[] };
  isFetching: boolean;
  status: string;
  dataUpdatedAt: number;
  refetch: (...args: never[]) => unknown;
}

export function useProcessingRefetchGuard(
  status: TaskStatus[] | undefined,
  query: ProcessingRefetchQueryState,
): void {
  const lastRefetchRef = useRef<number>(0);

  useEffect(() => {
    const timeSinceLastRefetch = Date.now() - lastRefetchRef.current;
    if (shouldForceProcessingRefetch(status, query, timeSinceLastRefetch)) {
      lastRefetchRef.current = Date.now();
      query.refetch();
    }
  }, [status, query.data, query.isFetching, query.status, query.dataUpdatedAt, query.refetch]);
}
