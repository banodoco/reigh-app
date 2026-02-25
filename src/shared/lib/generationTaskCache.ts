import { getSupabaseClient } from '@/integrations/supabase/client';
import { QueryClient } from '@tanstack/react-query';
import type { GenerationRow } from '@/domains/generation/types/generationViewRow';
import { Task } from '@/types/tasks';
import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { isTaskDbRow, mapTaskDbRowToTask } from '@/shared/lib/taskRowMapper';
import {
  getPrimaryTaskMappingsForGenerations,
  toGenerationTaskMappingCacheEntry,
  type GenerationTaskMappingCacheEntry,
  type GenerationTaskMappingStatus,
} from '@/shared/lib/generationTaskRepository';

interface PreloadGenerationTaskMappingsOptions {
  batchSize?: number;
  delayBetweenBatches?: number;
  preloadFullTaskData?: boolean;
  projectId?: string;
}

export interface GenerationWithTaskData extends GenerationRow {
  taskId?: string | null;
  taskData?: Task | null;
  taskMappingStatus?: GenerationTaskMappingStatus;
  taskMappingError?: string;
}

/**
 * Preload task mappings for a batch of generations in the background.
 */
export async function preloadGenerationTaskMappings(
  generationIds: string[],
  queryClient: QueryClient,
  options: PreloadGenerationTaskMappingsOptions = {},
) {
  const supabase = getSupabaseClient();
  const {
    batchSize = 5,
    delayBetweenBatches = 200,
    preloadFullTaskData = false,
    projectId,
  } = options;

  for (let i = 0; i < generationIds.length; i += batchSize) {
    const batch = generationIds.slice(i, i + batchSize);

    const mappings = await getPrimaryTaskMappingsForGenerations(batch, { projectId });
    let reportedBatchQueryFailure = false;

    const prefetchTasks: Array<Promise<unknown>> = [];

    batch.forEach((generationId) => {
      const mapping = mappings.get(generationId);
      const cacheEntry = toGenerationTaskMappingCacheEntry(mapping);
      queryClient.setQueryData<GenerationTaskCacheEntry>(
        taskQueryKeys.generationMapping(generationId),
        cacheEntry,
      );

      if (!reportedBatchQueryFailure && cacheEntry.status === 'query_failed' && cacheEntry.queryError) {
        reportedBatchQueryFailure = true;
        normalizeAndPresentError(new Error(cacheEntry.queryError), {
          context: 'GenerationTaskCache',
          showToast: false,
        });
      }

      if (preloadFullTaskData && cacheEntry.taskId && cacheEntry.status === 'ok') {
        prefetchTasks.push(queryClient.prefetchQuery({
          queryKey: taskQueryKeys.single(cacheEntry.taskId),
          queryFn: async () => {
            const { data, error } = await supabase
              .from('tasks')
              .select('*')
              .eq('id', cacheEntry.taskId)
              .single();

            if (error) throw error;
            if (!isTaskDbRow(data)) {
              throw new Error('Task row has unexpected shape');
            }
            return mapTaskDbRowToTask(data);
          },
          staleTime: 2 * 60 * 1000,
        }));
      }
    });

    if (prefetchTasks.length > 0) {
      await Promise.all(prefetchTasks);
    }

    if (i + batchSize < generationIds.length) {
      await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
    }
  }
}

/**
 * Enhance generations with task data from cache.
 */
export function enhanceGenerationsWithTaskData(
  generations: GenerationRow[],
  queryClient: QueryClient,
): GenerationWithTaskData[] {
  return generations.map((generation) => {
    const generationId = generation.generation_id ?? generation.id;
    const cachedMapping = queryClient.getQueryData<GenerationTaskCacheEntry>(
      taskQueryKeys.generationMapping(generationId),
    );
    const taskId = cachedMapping?.taskId || null;
    const taskData = taskId ? queryClient.getQueryData<Task>(taskQueryKeys.single(taskId)) : null;
    const taskMappingStatus = cachedMapping?.status ?? (taskId ? 'ok' : 'not_loaded');

    return {
      ...generation,
      taskId,
      taskData,
      taskMappingStatus,
      ...(cachedMapping?.queryError ? { taskMappingError: cachedMapping.queryError } : {}),
    };
  });
}
