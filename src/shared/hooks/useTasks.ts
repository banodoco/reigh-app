import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Task, TaskStatus, TASK_STATUS } from '@/types/tasks';
import { supabase } from '@/integrations/supabase/client';
import { handleError } from '@/shared/lib/errorHandler';
import { filterVisibleTasks, getVisibleTaskTypes } from '@/shared/lib/taskConfig';
// Removed invalidationRouter - DataFreshnessManager handles all invalidation logic
import { useSmartPollingConfig } from '@/shared/hooks/useSmartPolling';
import { QUERY_PRESETS, STANDARD_RETRY, STANDARD_RETRY_DELAY } from '@/shared/lib/queryDefaults';
import { queryKeys } from '@/shared/lib/queryKeys';
import { dataFreshnessManager } from '@/shared/realtime/DataFreshnessManager';

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
  params: Record<string, unknown> | null;
  status: string;
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

// Helper to convert DB row (snake_case) to Task interface (camelCase)
// Exported for use in prefetch utilities
export const mapDbTaskToTask = (row: TaskDbRow): Task => ({
  id: row.id,
  taskType: row.task_type,
  params: row.params,
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

// Hook to update task status
const useUpdateTaskStatus = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: TaskStatus }) => {
      const { data, error } = await supabase
        .from('tasks')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      // Task status change event is now handled by DataFreshnessManager via realtime events
    },
    onError: (error: Error) => {
      handleError(error, { context: 'useUpdateTaskStatus', toastTitle: 'Failed to update task status' });
    },
  });
};

// Hook to get a single task by ID
// Uses IMMUTABLE_PRESET since task data rarely changes after creation
export const useGetTask = (taskId: string) => {
  return useQuery<Task, Error>({
    queryKey: queryKeys.tasks.single(taskId),
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
  
  // 🎯 SMART POLLING: Use DataFreshnessManager for intelligent polling decisions
  const smartPollingConfig = useSmartPollingConfig(queryKeys.tasks.paginated(projectId!));
  
  // [TasksPaneCountMismatch] Debug unexpected limit values
  if (limit < 10) {
    // Limit too small for processing view - check for cache collision
  }
  
  const effectiveProjectId = projectId ?? (typeof window !== 'undefined' ? window.__PROJECT_CONTEXT__?.selectedProjectId : null);
  
  // For cache key: use 'all' when querying all projects, otherwise use effectiveProjectId
  const cacheProjectKey = allProjects ? 'all' : effectiveProjectId;
  
  const query = useQuery<PaginatedTasksResponse, Error>({
    // CRITICAL: Use page-based cache keys like gallery
    queryKey: [...queryKeys.tasks.paginated(cacheProjectKey as string), page, limit, status, taskType],
    queryFn: async (queryContext) => {
      
      // For all projects mode, we need allProjectIds; otherwise we need effectiveProjectId
      if (allProjects && (!allProjectIds || allProjectIds.length === 0)) {
        return { tasks: [], total: 0, hasMore: false, totalPages: 0, distinctTaskTypes: [] };
      }
      if (!allProjects && !effectiveProjectId) {
        return { tasks: [], total: 0, hasMore: false, totalPages: 0, distinctTaskTypes: [] }; 
      }
      
      // GALLERY PATTERN: Get count and data separately, efficiently
      // Always get accurate count - the approximation was causing 10x multiplication bug
      const shouldSkipCount = false;
      
      // 1. Get total count with lightweight query (skip if fast polling likely)
      // IMPORTANT: Filter to only visible task types at DB level to match what's displayed
      const visibleTaskTypes = getVisibleTaskTypes();
      
      let countQuery = supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .is('params->orchestrator_task_id_ref', null) // Only parent tasks
        .in('task_type', visibleTaskTypes); // Only visible task types

      // Apply project filter: either single project or multiple projects
      if (allProjects && allProjectIds) {
        countQuery = countQuery.in('project_id', allProjectIds);
      } else {
        countQuery = countQuery.eq('project_id', effectiveProjectId!);
      }

      if (status && status.length > 0) {
        countQuery = countQuery.in('status', status);
      }
      
      // Apply task type filter to count query (server-side filter)
      if (taskType) {
        countQuery = countQuery.eq('task_type', taskType);
      }

      // 2. Get paginated data with proper database pagination
      // Strategy: Use database pagination for most cases, only fetch extra for Processing status that needs sorting
      const needsCustomSorting = status?.some(s => s === TASK_STATUS.QUEUED || s === TASK_STATUS.IN_PROGRESS);
      
      let dataQuery = supabase
        .from('tasks')
        .select('*')
        .is('params->orchestrator_task_id_ref', null) // Only parent tasks
        .in('task_type', visibleTaskTypes); // Only visible task types
      
      // Apply project filter: either single project or multiple projects
      if (allProjects && allProjectIds) {
        dataQuery = dataQuery.in('project_id', allProjectIds);
      } else {
        dataQuery = dataQuery.eq('project_id', effectiveProjectId!);
      }

      // For Succeeded view, order by completion time (most recent first)
      const succeededOnly = status && status.length === 1 && status[0] === TASK_STATUS.COMPLETE;
      if (succeededOnly) {
        dataQuery = dataQuery
          .order('generation_processed_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }); // tie-breaker
      } else {
        // Default DB ordering; Processing will use client-side custom sort
        dataQuery = dataQuery.order('created_at', { ascending: false });
      }

      if (status && status.length > 0) {
        dataQuery = dataQuery.in('status', status);
      }
      
      // Apply task type filter to data query (server-side filter)
      if (taskType) {
        dataQuery = dataQuery.eq('task_type', taskType);
      }

      if (needsCustomSorting) {
        // For Processing tasks: Use progressive loading strategy
        // Start with a reasonable chunk size, expand if needed for first page
        const effectiveBaseLimit = Math.max(limit, PAGINATION_CONFIG.DEFAULT_LIMIT);
        let fetchLimit;
        
        if (page === 1) {
          // First page: fetch more to get a good sample for sorting, but cap it reasonably
          fetchLimit = Math.min(effectiveBaseLimit * PAGINATION_CONFIG.PROCESSING_FETCH_MULTIPLIER, PAGINATION_CONFIG.PROCESSING_MAX_FETCH);
        } else {
          // Subsequent pages: use standard pagination since first page established sort order
          fetchLimit = effectiveBaseLimit;
        }
        
        if (effectiveBaseLimit !== limit) {
          // Limit override for processing view
        }
        dataQuery = dataQuery.limit(fetchLimit);
      } else {
        // For Succeeded/Failed: use proper database pagination - no client sorting needed
        dataQuery = dataQuery.range(offset, offset + limit - 1);
      }

      // Execute queries (skip count for fast polling scenarios)
      const [countResult, { data, error: dataError }] = await Promise.all([
        shouldSkipCount ? Promise.resolve({ count: null, error: null }) : countQuery,
        dataQuery,
      ]);
      
      const { count, error: countError } = countResult;
      
      if (countError) {
        console.error('[TaskPollingDebug] Count query failed:', countError);
        // Track failure for circuit breaker
        dataFreshnessManager.onFetchFailure(queryKeys.tasks.paginated(effectiveProjectId), countError as Error);
        throw countError;
      }
      if (dataError) {
        console.error('[TaskPollingDebug] Data query failed:', dataError);
        // Track failure for circuit breaker
        dataFreshnessManager.onFetchFailure(queryKeys.tasks.paginated(effectiveProjectId), dataError as Error);
        throw dataError;
      }

      // Track success for circuit breaker
      dataFreshnessManager.onFetchSuccess(queryKeys.tasks.paginated(effectiveProjectId));
      
      // Apply client-side filtering and sorting
      const allTasks = (data || []).map(mapDbTaskToTask);
      const visibleTasks = filterVisibleTasks(allTasks);
      
      let paginatedTasks: typeof allTasks;
      
      if (needsCustomSorting) {
        // In Progress first, then Queued; within each, oldest to newest by created_at
        const sortedTasks = visibleTasks.sort((a, b) => {
          const getStatusPriority = (status: string) => {
            switch (status) {
              case TASK_STATUS.IN_PROGRESS: return 1;
              case TASK_STATUS.QUEUED: return 2;
              default: return 3;
            }
          };
          const aPriority = getStatusPriority(a.status);
          const bPriority = getStatusPriority(b.status);
          if (aPriority !== bPriority) {
            return aPriority - bPriority; // lower is higher priority
          }
          const aDate = new Date(a.createdAt || 0);
          const bDate = new Date(b.createdAt || 0);
          return aDate.getTime() - bDate.getTime(); // oldest first
        });
        paginatedTasks = sortedTasks.slice(offset, offset + limit);
      } else {
        // For Succeeded/Failed: data is already paginated by database
        paginatedTasks = visibleTasks;
      }
      
      // Use approximation when count is skipped during fast polling
      // For Processing tasks, use a more reasonable approximation based on current page
      const total = count !== null ? count : Math.max(paginatedTasks.length, offset + paginatedTasks.length);
      const totalPages = Math.ceil(total / limit);
      const hasMore = count !== null ? offset + limit < total : paginatedTasks.length >= limit;

      const result: PaginatedTasksResponse = {
        tasks: paginatedTasks,
        total,
        hasMore,
        totalPages,
      };

      return result;
    },
    enabled: !!effectiveProjectId,
    // Keep previous page's data visible during refetches to avoid UI blanks
    placeholderData: (previousData: PaginatedTasksResponse | undefined) => previousData,
    // Use realtimeBacked preset - tasks updated via realtime + mutations
    ...QUERY_PRESETS.realtimeBacked,
    // 🎯 SMART POLLING: Intelligent polling based on realtime health
    ...smartPollingConfig,
    refetchIntervalInBackground: true, // Enable background polling
    // Enhanced retry logic for transient network errors
    retry: STANDARD_RETRY,
    retryDelay: STANDARD_RETRY_DELAY,
  });
  
  // [TasksPaneCountMismatch] CRITICAL DEBUG: Log the actual query state to catch cache/stale issues
  // Reduced to simplified debug object without logging
  const queryDebugInfo = {
    projectId,
    page,
    limit,
    status,
    hasData: !!query.data,
    dataTasksCount: query.data?.tasks ? query.data.tasks.length : 0,
    dataAge: query.dataUpdatedAt ? Math.round((Date.now() - query.dataUpdatedAt) / 1000) + 's' : 'never',
  };
  
  // NUCLEAR OPTION: Force refetch if query has data but no tasks for Processing view
  // SAFETY: Only trigger if data is genuinely stale (older than 30 seconds) to prevent infinite loops
  const isProcessingFilter = status && status.includes('Queued') && status.includes('In Progress');
  const hasStaleEmptyData = query.data && query.data.tasks && query.data.tasks.length === 0 && !query.isFetching;
  const dataAge = query.dataUpdatedAt ? Date.now() - query.dataUpdatedAt : Infinity;
  const isDataStale = dataAge > 30000; // 30 seconds
  
  // Use React ref to prevent rapid refetches
  const lastRefetchRef = React.useRef<number>(0);
  const timeSinceLastRefetch = Date.now() - lastRefetchRef.current;
  const canRefetch = timeSinceLastRefetch > 10000; // 10 seconds minimum between refetches
  
  // When backgrounded, dampen nuclear refetches to avoid thrash under timer clamping
  const isHidden = typeof document !== 'undefined' ? document.hidden : false;
  const minBackoffMs = isHidden ? 60000 : 10000;
  const hiddenStaleThresholdMs = isHidden ? 60000 : 30000;
  const meetsStaleThreshold = dataAge > hiddenStaleThresholdMs;

  if (isProcessingFilter && hasStaleEmptyData && query.status === 'success' && meetsStaleThreshold && timeSinceLastRefetch > minBackoffMs) {
    lastRefetchRef.current = Date.now();
    // Force immediate refetch
    query.refetch();
  }
  
  return query;
};

/**
 * Cancel a task using direct Supabase call
 * For orchestrator tasks (travel_orchestrator, join_clips_orchestrator, etc.), also cancels all subtasks
 */
async function cancelTask(taskId: string): Promise<void> {
  // First, get the task to check if it's an orchestrator
  const { data: task, error: fetchError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch task: ${fetchError.message}`);
  }

  // Check if task can be cancelled (only Queued tasks can be cancelled from UI)
  if (task.status !== 'Queued' && task.status !== 'In Progress') {
    throw new Error(`Task is already ${task.status}`);
  }

  // Cancel the main task - use .select() to verify the update happened
  const { data: updatedTask, error: cancelError } = await supabase
    .from('tasks')
    .update({
      status: 'Cancelled',
      updated_at: new Date().toISOString()
    })
    .eq('id', taskId)
    .select('id, status')
    .single();

  if (cancelError) {
    throw new Error(`Failed to cancel task: ${cancelError.message}`);
  }

  // Verify the update actually happened
  if (!updatedTask || updatedTask.status !== 'Cancelled') {
    console.error('[cancelTask] Update returned but status not Cancelled:', updatedTask);
    throw new Error('Task cancellation failed - status not updated');
  }

  // If it's an orchestrator task, cancel all subtasks
  if (task && task.task_type?.includes('orchestrator')) {
    // Find all subtasks that reference this orchestrator
    const { data: subtasks, error: subtaskFetchError } = await supabase
      .from('tasks')
      .select('id, params')
      .eq('project_id', task.project_id)
      .in('status', ['Queued']);

    if (!subtaskFetchError && subtasks) {
      const subtaskIds = subtasks.filter(subtask => {
        const params = subtask.params as Record<string, unknown> | null;
        return params?.orchestrator_task_id_ref === taskId ||
               params?.orchestrator_task_id === taskId;
      }).map(subtask => subtask.id);

      if (subtaskIds.length > 0) {
        // Cancel all subtasks
        const { error: subtaskCancelError } = await supabase
          .from('tasks')
          .update({ 
            status: 'Cancelled',
            updated_at: new Date().toISOString()
          })
          .in('id', subtaskIds);

        if (subtaskCancelError) {
          console.error('Failed to cancel subtasks:', subtaskCancelError);
        }
      }
    }
  }
}

// Hook to cancel a task using Supabase
export const useCancelTask = (projectId: string | null) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelTask,
    onSuccess: (_, taskId) => {
      // Immediately invalidate tasks queries so cancelled task disappears
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.paginatedAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.statusCountsAll });
      // Immediately invalidate pending task queries so indicators update instantly
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'pending-segment-tasks' ||
          query.queryKey[0] === 'pending-generation-tasks'
      });
    },
    onError: (error: Error) => {
      handleError(error, { context: 'useCancelTask', toastTitle: 'Failed to cancel task' });
    },
  });
};

interface CancelAllPendingTasksResponse {
  cancelledCount: number;
  message: string;
}

/**
 * Cancel all pending tasks for a project using direct Supabase call
 * For orchestrator tasks (travel_orchestrator, join_clips_orchestrator, etc.), also cancels their subtasks
 */
async function cancelPendingTasks(projectId: string): Promise<CancelAllPendingTasksResponse> {
  // First, get all pending tasks to check for orchestrators
  const { data: pendingTasks, error: fetchError } = await supabase
    .from('tasks')
    .select('id, task_type')
    .eq('project_id', projectId)
    .in('status', ['Queued']);

  if (fetchError) {
    throw new Error(`Failed to fetch pending tasks: ${fetchError.message}`);
  }

  // Collect all task IDs to cancel (including subtasks)
  const tasksToCancel = new Set<string>();

  // Add all pending tasks
  pendingTasks?.forEach(task => tasksToCancel.add(task.id));

  // Find orchestrator tasks
  const orchestratorIds = pendingTasks
    ?.filter(task => task.task_type?.includes('orchestrator'))
    .map(task => task.id) || [];

  // If there are orchestrators, find their subtasks
  if (orchestratorIds.length > 0) {
    const { data: allProjectTasks, error: allTasksError } = await supabase
      .from('tasks')
      .select('id, params')
      .eq('project_id', projectId)
      .in('status', ['Queued']);

    if (!allTasksError && allProjectTasks) {
      allProjectTasks.forEach(task => {
        const params = task.params as Record<string, unknown> | null;
        const orchestratorRef = params?.orchestrator_task_id_ref || params?.orchestrator_task_id;

        if (orchestratorRef && orchestratorIds.includes(orchestratorRef)) {
          tasksToCancel.add(task.id);
        }
      });
    }
  }

  // Cancel all collected tasks
  const taskIdsArray = Array.from(tasksToCancel);

  if (taskIdsArray.length > 0) {
    const { error: cancelError } = await supabase
      .from('tasks')
      .update({
        status: 'Cancelled',
        updated_at: new Date().toISOString()
      })
      .in('id', taskIdsArray);

    if (cancelError) {
      throw new Error(`Failed to cancel tasks: ${cancelError.message}`);
    }
  }

  return {
    cancelledCount: taskIdsArray.length,
    message: `${taskIdsArray.length} tasks cancelled (including subtasks)`,
  };
}

// Hook to cancel pending tasks using Supabase
const useCancelPendingTasks = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelPendingTasks,
    onSuccess: (data, projectId) => {
      // Immediately invalidate tasks queries so cancelled tasks disappear
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.paginatedAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.statusCountsAll });
    },
    onError: (error: Error) => {
      handleError(error, { context: 'useCancelPendingTasks', toastTitle: 'Failed to cancel pending tasks' });
    },
  });
};

// Export alias for backward compatibility
export const useCancelAllPendingTasks = useCancelPendingTasks;

// Hook to get status counts for indicators
export const useTaskStatusCounts = (projectId: string | null) => {
  // 🎯 SMART POLLING: Use DataFreshnessManager for intelligent polling decisions
  const smartPollingConfig = useSmartPollingConfig(projectId ? queryKeys.tasks.statusCounts(projectId) : ['task-status-counts', null]);

  return useQuery({
    queryKey: projectId ? queryKeys.tasks.statusCounts(projectId) : ['task-status-counts', null],
    queryFn: async () => {
      // [TasksPaneCountMismatch] Note on counting rules for correlation with list visibility
      
      if (!projectId) {
        return { processing: 0, recentSuccesses: 0, recentFailures: 0 };
      }

      // Match TasksPane list semantics: only count visible task types (and parent tasks)
      const visibleTaskTypes = getVisibleTaskTypes();

      // Get 1 hour ago timestamp
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // Execute all queries in parallel with error resilience
      const [processingResult, successResult, failureResult] = await Promise.allSettled([
        // Query for processing tasks (any time)
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .in('status', ['Queued', 'In Progress'])
          .is('params->orchestrator_task_id_ref', null) // Only parent tasks; include orchestrators
          .in('task_type', visibleTaskTypes), // Only visible task types
          
        // Query for recent successes (last hour)
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .eq('status', 'Complete')
          // `updated_at` is often null/unreliable in this schema; `generation_processed_at` is the real completion timestamp.
          .gte('generation_processed_at', oneHourAgo)
          .is('params->orchestrator_task_id_ref', null) // Only parent tasks
          .in('task_type', visibleTaskTypes), // Only visible task types
          
        // Query for recent failures (last hour)
        // NOTE: Use `updated_at` for failures since `generation_processed_at` is only set on success
        // NOTE: Only count 'Failed', not 'Cancelled' - cancelled tasks are user-initiated and not errors
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .eq('status', 'Failed')
          .gte('updated_at', oneHourAgo)
          .is('params->orchestrator_task_id_ref', null) // Only parent tasks
          .in('task_type', visibleTaskTypes) // Only visible task types
      ]);

      // Handle processing count result
      let processingCount = 0;
      if (processingResult.status === 'fulfilled') {
        const { count, error } = processingResult.value;
        if (error) {
          console.error('[PollingBreakageIssue] useTaskStatusCounts query error (processing):', {
            projectId,
            error,
            errorMessage: error.message,
            errorCode: error.code,
            errorDetails: error.details,
            errorHint: error.hint,
            timestamp: Date.now()
          });
        } else {
          processingCount = count || 0;
        }
      } else {
        console.error('[PollingBreakageIssue] Processing query promise rejected:', {
          projectId,
          reason: processingResult.reason,
          timestamp: Date.now()
        });
      }

      // Handle success count result
      let successCount = 0;
      if (successResult.status === 'fulfilled') {
        const { count, error } = successResult.value;
        if (error) {
          console.error('[PollingBreakageIssue] useTaskStatusCounts query error (success):', {
            projectId,
            error,
            errorMessage: error.message,
            errorCode: error.code,
            errorDetails: error.details,
            errorHint: error.hint,
            timestamp: Date.now()
          });
        } else {
          successCount = count || 0;
        }
      } else {
        console.error('[PollingBreakageIssue] Success query promise rejected:', {
          projectId,
          reason: successResult.reason,
          timestamp: Date.now()
        });
      }

      // Handle failure count result
      let failureCount = 0;
      if (failureResult.status === 'fulfilled') {
        const { count, error } = failureResult.value;
        if (error) {
          console.error('[PollingBreakageIssue] useTaskStatusCounts query error (failure):', {
            projectId,
            error,
            errorMessage: error.message,
            errorCode: error.code,
            errorDetails: error.details,
            errorHint: error.hint,
            timestamp: Date.now()
          });
        } else {
          failureCount = count || 0;
        }
      } else {
        console.error('[PollingBreakageIssue] Failure query promise rejected:', {
          projectId,
          reason: failureResult.reason,
          timestamp: Date.now()
        });
      }

      const result = {
        processing: processingCount,
        recentSuccesses: successCount,
        recentFailures: failureCount,
      };
      
      // [TasksPaneCountMismatch] Result snapshot to compare with list view

      // Track circuit breaker - if any query failed, record failure; otherwise record success
      const anyFailed = processingResult.status === 'rejected' ||
                        successResult.status === 'rejected' ||
                        failureResult.status === 'rejected' ||
                        (processingResult.status === 'fulfilled' && processingResult.value.error) ||
                        (successResult.status === 'fulfilled' && successResult.value.error) ||
                        (failureResult.status === 'fulfilled' && failureResult.value.error);

      if (anyFailed) {
        const errorReason = processingResult.status === 'rejected' ? processingResult.reason :
                           successResult.status === 'rejected' ? successResult.reason :
                           failureResult.status === 'rejected' ? failureResult.reason :
                           new Error('Query returned error');
        dataFreshnessManager.onFetchFailure(queryKeys.tasks.statusCounts(projectId), errorReason as Error);
      } else {
        dataFreshnessManager.onFetchSuccess(queryKeys.tasks.statusCounts(projectId));
      }

      return result;
    },
    enabled: !!projectId,
    // 🎯 SMART POLLING: Intelligent polling based on realtime health
    ...smartPollingConfig,
    refetchIntervalInBackground: true, // Enable background polling like the gallery
    // Enhanced retry logic for transient network errors
    retry: STANDARD_RETRY,
    retryDelay: STANDARD_RETRY_DELAY,
  });
};

/**
 * Hook to get all visible task types from the config
 * Simply returns the allowlist from taskConfig - no database query needed
 */
export const useAllTaskTypes = (_projectId: string | null) => {
  return useQuery({
    queryKey: queryKeys.tasks.allTypes,
    queryFn: () => {
      // Just use the hardcoded allowlist from taskConfig
      const visibleTypes = getVisibleTaskTypes();
      return visibleTypes;
    },
    // Use immutable preset - hardcoded list never changes at runtime
    ...QUERY_PRESETS.immutable,
    gcTime: Infinity, // Keep forever
  });
};
