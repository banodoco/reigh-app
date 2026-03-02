import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Task, TaskStatus } from '@/types/tasks';
import { getSupabaseClientResult } from '@/integrations/supabase/client';
import { getVisibleTaskTypes } from '@/shared/lib/taskConfig';
import { normalizeAndPresentAndRethrow } from '@/shared/lib/errorHandling/runtimeError';
// Removed invalidationRouter - DataFreshnessManager handles all invalidation logic
import { useSmartPollingConfig } from '@/shared/hooks/useSmartPolling';
import { QUERY_PRESETS, STANDARD_RETRY, STANDARD_RETRY_DELAY } from '@/shared/lib/queryDefaults';
import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';
import { useProcessingRefetchGuard } from '@/shared/hooks/tasks/useProcessingRefetchGuard';
import {
  notifyPaginatedTaskFetchFailure,
  notifyPaginatedTaskFetchSuccess,
} from '@/shared/realtime/dataFreshness/taskFetchFreshness';
import {
  fetchPaginatedTasks,
  mapDbTaskToTask,
  type PaginatedTaskQuery,
  type PaginatedTasksResponse as RepositoryPaginatedTasksResponse,
} from '@/shared/hooks/tasks/paginatedTaskRepository';
import { getProjectSelectionFallbackId } from '@/shared/contexts/projectSelectionStore';

// Types for API responses and request bodies
// Ensure these align with your server-side definitions and Task type in @/types/tasks.ts

interface PaginatedTasksParams {
  projectId?: string | null;
  status?: TaskStatus[];
  limit?: number;
  offset?: number;
  taskType?: string | null; // Filter by specific task type
  allProjects?: boolean; // If true, query across all projects
  allProjectIds?: string[]; // List of project IDs to query when allProjects is true
}

export type PaginatedTasksResponse = RepositoryPaginatedTasksResponse;
function createPaginatedTasksQueryFn(filters: PaginatedTaskQuery, cacheProjectKey: string) {
  return async (): Promise<PaginatedTasksResponse> => {
    try {
      const result = await fetchPaginatedTasks(filters);
      notifyPaginatedTaskFetchSuccess(cacheProjectKey);
      return result;
    } catch (error) {
      notifyPaginatedTaskFetchFailure(cacheProjectKey, error);
      normalizeAndPresentAndRethrow(error, {
        context: 'useTasks.fetchPaginatedTasks',
        showToast: false,
        logData: { cacheProjectKey },
      });
    }
  };
}

// Helper to convert DB row (snake_case) to Task interface (camelCase)
// Exported for use in prefetch utilities
export { mapDbTaskToTask };

// Hook to get a single task by ID
// Uses IMMUTABLE_PRESET since task data rarely changes after creation
function resolveTaskProjectScope(projectId?: string | null): string | null {
  if (projectId && projectId.trim().length > 0) {
    return projectId;
  }
  const selectedProjectId = getProjectSelectionFallbackId();
  if (selectedProjectId && selectedProjectId.trim().length > 0) {
    return selectedProjectId;
  }
  return null;
}

export const useGetTask = (taskId: string, projectId?: string | null) => {
  const effectiveProjectId = resolveTaskProjectScope(projectId);

  return useQuery<Task | null, Error>({
    queryKey: taskQueryKeys.single(taskId, effectiveProjectId),
    queryFn: async () => {
      const supabaseResult = getSupabaseClientResult();
      if (!supabaseResult.ok) {
        normalizeAndPresentAndRethrow(supabaseResult.error, {
          context: 'useTasks.useGetTask',
          showToast: false,
          logData: { taskId, projectId: effectiveProjectId },
        });
      }

      const { data, error } = await supabaseResult.client
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .eq('project_id', effectiveProjectId!)
        .maybeSingle();

      if (error) {
        normalizeAndPresentAndRethrow(error, {
          context: 'useTasks.useGetTask',
          showToast: false,
          logData: { taskId, projectId: effectiveProjectId },
        });
      }

      if (!data) {
        return null;
      }

      return mapDbTaskToTask(data);
    },
    enabled: !!taskId && !!effectiveProjectId,
    // Task data is essentially immutable once created - cache aggressively
    ...QUERY_PRESETS.immutable,
  });
};

// Hook to list tasks with pagination - GALLERY PATTERN
export const usePaginatedTasks = (params: PaginatedTasksParams) => {
  const { projectId, status, limit = 50, offset = 0, taskType, allProjects, allProjectIds } = params;
  const page = Math.floor(offset / limit) + 1;
  const effectiveProjectId: string | null = projectId ?? null;
  const cacheProjectKey = allProjects ? 'all' : effectiveProjectId;
  const safeCacheProjectKey = cacheProjectKey ?? '__no-project__';
  const visibleTaskTypes = getVisibleTaskTypes();
  const smartPollingConfig = useSmartPollingConfig(taskQueryKeys.paginated(safeCacheProjectKey));

  const query = useQuery<PaginatedTasksResponse, Error>({
    queryKey: [...taskQueryKeys.paginated(safeCacheProjectKey), page, limit, status, taskType],
    queryFn: createPaginatedTasksQueryFn({
      allProjects,
      allProjectIds,
      effectiveProjectId,
      status,
      taskType,
      visibleTaskTypes,
      limit,
      offset,
      page,
    }, safeCacheProjectKey),
    enabled: allProjects ? !!allProjectIds?.length : !!effectiveProjectId,
    placeholderData: keepPreviousData,
    ...QUERY_PRESETS.realtimeBacked,
    ...smartPollingConfig,
    refetchIntervalInBackground: true,
    retry: STANDARD_RETRY,
    retryDelay: STANDARD_RETRY_DELAY,
  });

  useProcessingRefetchGuard(status, query);

  return query;
};
