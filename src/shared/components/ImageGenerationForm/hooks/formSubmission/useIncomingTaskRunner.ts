import { useCallback } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { IncomingTask } from '@/shared/contexts/IncomingTasksContext';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';

interface UseIncomingTaskRunnerInput {
  addIncomingTask: (task: Omit<IncomingTask, 'id' | 'startedAt'>) => string;
  completeIncomingTask: (id: string, newBaseline: number) => void;
  queryClient: QueryClient;
}

interface RunIncomingTaskOptions {
  label: string;
  expectedCount: number;
  projectIdForCounts?: string;
  context: string;
  toastTitle: string;
  execute: () => Promise<void>;
}

export type RunIncomingTask = (options: RunIncomingTaskOptions) => void;

async function refetchTaskQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.refetchQueries({ queryKey: taskQueryKeys.paginatedAll });
  await queryClient.refetchQueries({ queryKey: taskQueryKeys.statusCountsAll });
}

function getProcessingCount(queryClient: QueryClient, projectIdForCounts?: string): number {
  if (!projectIdForCounts) {
    return 0;
  }

  return queryClient.getQueryData<{ processing: number }>(taskQueryKeys.statusCounts(projectIdForCounts))?.processing ?? 0;
}

export function useIncomingTaskRunner(input: UseIncomingTaskRunnerInput): RunIncomingTask {
  const { addIncomingTask, completeIncomingTask, queryClient } = input;

  return useCallback((options: RunIncomingTaskOptions) => {
    const incomingTaskId = addIncomingTask({
      taskType: 'image_generation',
      label: options.label,
      expectedCount: options.expectedCount,
      baselineCount: 0,
    });

    void (async () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[IncomingTaskRunner] execute start', { context: options.context, label: options.label, expectedCount: options.expectedCount });
      }
      try {
        await options.execute();
        if (process.env.NODE_ENV === 'development') {
          console.log('[IncomingTaskRunner] execute success', options.context);
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[IncomingTaskRunner] execute FAILED', options.context, error);
        }
        handleError(error, { context: options.context, toastTitle: options.toastTitle });
      } finally {
        if (process.env.NODE_ENV === 'development') {
          console.log('[IncomingTaskRunner] refetching task queries', options.context);
        }
        await refetchTaskQueries(queryClient);
        const processingCount = getProcessingCount(queryClient, options.projectIdForCounts);
        if (process.env.NODE_ENV === 'development') {
          console.log('[IncomingTaskRunner] refetch done, processingCount:', processingCount, options.context);
        }
        completeIncomingTask(incomingTaskId, processingCount);
      }
    })();
  }, [addIncomingTask, completeIncomingTask, queryClient]);
}
