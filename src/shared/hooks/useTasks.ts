import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Task, TaskStatus, TASK_STATUS } from '@/types/tasks';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { filterVisibleTasks, getVisibleTaskTypes } from '@/shared/lib/taskConfig';
// Removed invalidationRouter - DataFreshnessManager handles all invalidation logic
import { useSmartPollingConfig } from '@/shared/hooks/useSmartPolling';
import { QUERY_PRESETS, STANDARD_RETRY, STANDARD_RETRY_DELAY } from '@/shared/lib/queryDefaults';
import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';
import { dataFreshnessManager } from '@/shared/realtime/DataFreshnessManager';

// Re-export extracted modules for backwards compatibility
export { useCancelTask, useCancelAllPendingTasks } from './useTaskCancellation';
export { useTaskStatusCounts, useAllTaskTypes } from './useTaskStatusCounts';

// Pagination configuration constants
const PAGINATION_CONFIG = {
  // For Processing tasks that need custom sorting
  // Reduced multiplier to avoid slow 150+ task fetches
  PROCESSING_FETCH_MULTIPLIER: 2,
  PROCESSING_MAX_FETCH: 100,
  // Default limits
  DEFAULT_LIMIT: 50,
} as const;

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

export interface PaginatedTasksResponse {
  tasks: Task[];
  total: number;
  hasMore: boolean;
  totalPages: number;
}

interface TaskDbRow {
  id: string;
  task_type: string;
  params: Json | null;
  status: TaskStatus;
  dependant_on?: string[] | null;
  output_location?: string | null;
  created_at: string;
  updated_at?: string | null;
  project_id: string;
  cost_cents?: number | null;
  generation_started_at?: string | null;
  generation_processed_at?: string | null;
  error_message?: string | null;
}

interface PaginatedQueryFilters {
  allProjects?: boolean;
  allProjectIds?: string[];
  effectiveProjectId: string | null;
  status?: TaskStatus[];
  taskType?: string | null;
  visibleTaskTypes: string[];
}

interface PaginatedDataQueryFilters extends PaginatedQueryFilters {
  limit: number;
  offset: number;
  page: number;
}

const EMPTY_PAGINATED_TASKS_RESPONSE: PaginatedTasksResponse = {
  tasks: [],
  total: 0,
  hasMore: false,
  totalPages: 0,
};

function isProcessingStatusFilter(status?: TaskStatus[]): boolean {
  return !!status?.some((value) => value === TASK_STATUS.QUEUED || value === TASK_STATUS.IN_PROGRESS);
}

function isSucceededOnlyStatus(status?: TaskStatus[]): boolean {
  return !!status && status.length === 1 && status[0] === TASK_STATUS.COMPLETE;
}

function buildCountQuery(filters: PaginatedQueryFilters) {
  let query = supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .is('params->orchestrator_task_id_ref', null)
    .in('task_type', filters.visibleTaskTypes);

  if (filters.allProjects && filters.allProjectIds) {
    query = query.in('project_id', filters.allProjectIds);
  } else {
    query = query.eq('project_id', filters.effectiveProjectId!);
  }

  if (filters.status?.length) {
    query = query.in('status', filters.status);
  }

  if (filters.taskType) {
    query = query.eq('task_type', filters.taskType);
  }

  return query;
}

function buildDataQuery(filters: PaginatedDataQueryFilters) {
  const needsCustomSorting = isProcessingStatusFilter(filters.status);
  const succeededOnly = isSucceededOnlyStatus(filters.status);

  let query = supabase
    .from('tasks')
    .select('*')
    .is('params->orchestrator_task_id_ref', null)
    .in('task_type', filters.visibleTaskTypes);

  if (filters.allProjects && filters.allProjectIds) {
    query = query.in('project_id', filters.allProjectIds);
  } else {
    query = query.eq('project_id', filters.effectiveProjectId!);
  }

  if (succeededOnly) {
    query = query
      .order('generation_processed_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  if (filters.status?.length) {
    query = query.in('status', filters.status);
  }

  if (filters.taskType) {
    query = query.eq('task_type', filters.taskType);
  }

  if (needsCustomSorting) {
    const effectiveBaseLimit = Math.max(filters.limit, PAGINATION_CONFIG.DEFAULT_LIMIT);
    const fetchLimit = filters.page === 1
      ? Math.min(
        effectiveBaseLimit * PAGINATION_CONFIG.PROCESSING_FETCH_MULTIPLIER,
        PAGINATION_CONFIG.PROCESSING_MAX_FETCH
      )
      : effectiveBaseLimit;

    return query.limit(fetchLimit);
  }

  return query.range(filters.offset, filters.offset + filters.limit - 1);
}

function sortProcessingTasks(tasks: Task[]): Task[] {
  const getStatusPriority = (status: string): number => {
    switch (status) {
      case TASK_STATUS.IN_PROGRESS:
        return 1;
      case TASK_STATUS.QUEUED:
        return 2;
      default:
        return 3;
    }
  };

  return [...tasks].sort((a, b) => {
    const aPriority = getStatusPriority(a.status);
    const bPriority = getStatusPriority(b.status);
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  });
}

function buildPaginatedTasksResponse(
  visibleTasks: Task[],
  needsCustomSorting: boolean,
  count: number | null,
  offset: number,
  limit: number
): PaginatedTasksResponse {
  const paginatedTasks = needsCustomSorting
    ? sortProcessingTasks(visibleTasks).slice(offset, offset + limit)
    : visibleTasks;
  const total = count !== null ? count : Math.max(paginatedTasks.length, offset + paginatedTasks.length);
  const totalPages = Math.ceil(total / limit);
  const hasMore = count !== null ? offset + limit < total : paginatedTasks.length >= limit;

  return {
    tasks: paginatedTasks,
    total,
    hasMore,
    totalPages,
  };
}

function createPaginatedTasksQueryFn(filters: PaginatedDataQueryFilters) {
  return async (): Promise<PaginatedTasksResponse> => {
    if (filters.allProjects && (!filters.allProjectIds || filters.allProjectIds.length === 0)) {
      return EMPTY_PAGINATED_TASKS_RESPONSE;
    }
    if (!filters.allProjects && !filters.effectiveProjectId) {
      return EMPTY_PAGINATED_TASKS_RESPONSE;
    }

    const needsCustomSorting = isProcessingStatusFilter(filters.status);
    const [countResult, { data, error: dataError }] = await Promise.all([
      buildCountQuery(filters),
      buildDataQuery(filters),
    ]);
    const { count, error: countError } = countResult;

    if (countError) {
      dataFreshnessManager.onFetchFailure(taskQueryKeys.paginated(filters.effectiveProjectId!), countError as Error);
      throw countError;
    }
    if (dataError) {
      dataFreshnessManager.onFetchFailure(taskQueryKeys.paginated(filters.effectiveProjectId!), dataError as Error);
      throw dataError;
    }

    dataFreshnessManager.onFetchSuccess(taskQueryKeys.paginated(filters.effectiveProjectId!));
    const allTasks = (data || []).map(mapDbTaskToTask);
    const visibleTasks = filterVisibleTasks(allTasks);

    return buildPaginatedTasksResponse(
      visibleTasks,
      needsCustomSorting,
      count,
      filters.offset,
      filters.limit
    );
  };
}

function shouldForceProcessingRefetch(
  status: TaskStatus[] | undefined,
  query: {
    data?: PaginatedTasksResponse;
    isFetching: boolean;
    status: string;
    dataUpdatedAt: number;
  },
  timeSinceLastRefetch: number
): boolean {
  const processingFilterSelected = !!status
    && status.includes(TASK_STATUS.QUEUED)
    && status.includes(TASK_STATUS.IN_PROGRESS);
  const hasStaleEmptyData = !!query.data && query.data.tasks.length === 0 && !query.isFetching;
  const dataAge = query.dataUpdatedAt ? Date.now() - query.dataUpdatedAt : Infinity;
  const isHidden = typeof document !== 'undefined' ? document.hidden : false;
  const minBackoffMs = isHidden ? 60000 : 10000;
  const staleThresholdMs = isHidden ? 60000 : 30000;
  const meetsStaleThreshold = dataAge > staleThresholdMs;

  return processingFilterSelected
    && hasStaleEmptyData
    && query.status === 'success'
    && meetsStaleThreshold
    && timeSinceLastRefetch > minBackoffMs;
}

// Helper to convert DB row (snake_case) to Task interface (camelCase)
// Exported for use in prefetch utilities
export const mapDbTaskToTask = (row: TaskDbRow): Task => ({
  id: row.id,
  taskType: row.task_type,
  params: (row.params && typeof row.params === 'object' && !Array.isArray(row.params))
    ? (row.params as Record<string, unknown>)
    : {},
  status: row.status,
  dependantOn: row.dependant_on ?? undefined,
  outputLocation: row.output_location ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at ?? undefined,
  projectId: row.project_id,
  costCents: row.cost_cents ?? undefined,
  generationStartedAt: row.generation_started_at ?? undefined,
  generationProcessedAt: row.generation_processed_at ?? undefined,
  errorMessage: row.error_message ?? undefined,
});

// Hook to get a single task by ID
// Uses IMMUTABLE_PRESET since task data rarely changes after creation
export const useGetTask = (taskId: string) => {
  return useQuery<Task, Error>({
    queryKey: taskQueryKeys.single(taskId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      if (error) {
        throw new Error(`Task with ID ${taskId} not found: ${error.message}`);
      }

      return mapDbTaskToTask(data);
    },
    enabled: !!taskId,
    // Task data is essentially immutable once created - cache aggressively
    ...QUERY_PRESETS.immutable,
  });
};

// Hook to list tasks with pagination - GALLERY PATTERN
export const usePaginatedTasks = (params: PaginatedTasksParams) => {
  const { projectId, status, limit = 50, offset = 0, taskType, allProjects, allProjectIds } = params;
  const page = Math.floor(offset / limit) + 1;
  const effectiveProjectId: string | null = projectId
    ?? (typeof window !== 'undefined' ? window.__PROJECT_CONTEXT__?.selectedProjectId ?? null : null);
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
    }),
    enabled: !!effectiveProjectId,
    placeholderData: (previousData: PaginatedTasksResponse | undefined) => previousData,
    ...QUERY_PRESETS.realtimeBacked,
    ...smartPollingConfig,
    refetchIntervalInBackground: true,
    retry: STANDARD_RETRY,
    retryDelay: STANDARD_RETRY_DELAY,
  });

  const lastRefetchRef = React.useRef<number>(0);
  const timeSinceLastRefetch = Date.now() - lastRefetchRef.current;
  if (shouldForceProcessingRefetch(status, query, timeSinceLastRefetch)) {
    lastRefetchRef.current = Date.now();
    query.refetch();
  }

  return query;
};
