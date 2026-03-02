import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '@/integrations/supabase/client';
import { getVisibleTaskTypes } from '@/shared/lib/taskConfig';
import { useSmartPollingConfig } from '@/shared/hooks/useSmartPolling';
import { QUERY_PRESETS, STANDARD_RETRY, STANDARD_RETRY_DELAY } from '@/shared/lib/queryDefaults';
import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';
import { dataFreshnessManager } from '@/shared/realtime/DataFreshnessManager';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  TASK_FAILURE_STATUSES,
  TASK_PROCESSING_STATUSES,
} from '@/shared/lib/tasks/taskStatusSemantics';
import { applyRootTaskFilter } from '@/shared/lib/tasks/orchestratorReference';
import {
  operationFailure,
  operationSuccess,
  type OperationResult,
} from '@/shared/lib/operationResult';

type TaskStatusCountsQuery = 'processing' | 'success' | 'failure';

export interface TaskStatusCountsResult {
  processing: number;
  recentSuccesses: number;
  recentFailures: number;
  degraded: boolean;
  failedQueries: TaskStatusCountsQuery[];
  errorCode?: 'task_status_counts_partial_failure';
  operation: OperationResult<{
    processing: number;
    recentSuccesses: number;
    recentFailures: number;
  }>;
}

// Hook to get status counts for indicators
export const useTaskStatusCounts = (projectId: string | null) => {
  const cacheProjectId = projectId ?? '__no-project__';
  // SMART POLLING: Use DataFreshnessManager for intelligent polling decisions
  const smartPollingConfig = useSmartPollingConfig(taskQueryKeys.statusCounts(cacheProjectId));

  return useQuery({
    queryKey: taskQueryKeys.statusCounts(cacheProjectId),
    queryFn: async () => {
      // [TasksPaneCountMismatch] Note on counting rules for correlation with list visibility

      if (!projectId) {
        return {
          processing: 0,
          recentSuccesses: 0,
          recentFailures: 0,
          degraded: false,
          failedQueries: [],
          operation: operationSuccess(
            {
              processing: 0,
              recentSuccesses: 0,
              recentFailures: 0,
            },
            { policy: 'best_effort' },
          ),
        } satisfies TaskStatusCountsResult;
      }

      // Match TasksPane list semantics: only count visible task types (and parent tasks)
      const visibleTaskTypes = getVisibleTaskTypes();

      // Get 1 hour ago timestamp
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // Execute all queries in parallel with error resilience
      const supabase = getSupabaseClient();
      const [processingResult, successResult, failureResult] = await Promise.allSettled([
        // Query for processing tasks (any time)
        applyRootTaskFilter(supabase.from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .in('status', [...TASK_PROCESSING_STATUSES])
          .in('task_type', visibleTaskTypes)), // Only visible task types

        // Query for recent successes (last hour)
        applyRootTaskFilter(supabase.from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .eq('status', 'Complete')
          // `updated_at` is often null/unreliable in this schema; `generation_processed_at` is the real completion timestamp.
          .gte('generation_processed_at', oneHourAgo)
          .in('task_type', visibleTaskTypes)), // Only visible task types

        // Query for recent failures (last hour)
        // NOTE: Use `updated_at` for failures since `generation_processed_at` is only set on success
        applyRootTaskFilter(supabase.from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .in('status', [...TASK_FAILURE_STATUSES])
          .gte('updated_at', oneHourAgo)
          .in('task_type', visibleTaskTypes)) // Only visible task types
      ]);

      const failedQueries: TaskStatusCountsQuery[] = [];

      // Handle processing count result
      let processingCount = 0;
      if (processingResult.status === 'fulfilled') {
        const { count, error } = processingResult.value;
        if (error) {
          failedQueries.push('processing');
          normalizeAndPresentError(error, { context: 'useTaskStatusCounts.processing', showToast: false, logData: { projectId } });
        } else {
          processingCount = count || 0;
        }
      } else {
        failedQueries.push('processing');
        normalizeAndPresentError(processingResult.reason instanceof Error ? processingResult.reason : new Error(String(processingResult.reason)), { context: 'useTaskStatusCounts.processing', showToast: false, logData: { projectId } });
      }

      // Handle success count result
      let successCount = 0;
      if (successResult.status === 'fulfilled') {
        const { count, error } = successResult.value;
        if (error) {
          failedQueries.push('success');
          normalizeAndPresentError(error, { context: 'useTaskStatusCounts.success', showToast: false, logData: { projectId } });
        } else {
          successCount = count || 0;
        }
      } else {
        failedQueries.push('success');
        normalizeAndPresentError(successResult.reason instanceof Error ? successResult.reason : new Error(String(successResult.reason)), { context: 'useTaskStatusCounts.success', showToast: false, logData: { projectId } });
      }

      // Handle failure count result
      let failureCount = 0;
      if (failureResult.status === 'fulfilled') {
        const { count, error } = failureResult.value;
        if (error) {
          failedQueries.push('failure');
          normalizeAndPresentError(error, { context: 'useTaskStatusCounts.failure', showToast: false, logData: { projectId } });
        } else {
          failureCount = count || 0;
        }
      } else {
        failedQueries.push('failure');
        normalizeAndPresentError(failureResult.reason instanceof Error ? failureResult.reason : new Error(String(failureResult.reason)), { context: 'useTaskStatusCounts.failure', showToast: false, logData: { projectId } });
      }

      const result: TaskStatusCountsResult = {
        processing: processingCount,
        recentSuccesses: successCount,
        recentFailures: failureCount,
        degraded: failedQueries.length > 0,
        failedQueries,
        ...(failedQueries.length > 0 ? { errorCode: 'task_status_counts_partial_failure' as const } : {}),
        operation:
          failedQueries.length > 0
            ? operationFailure(
                new Error('Task status counts query partially failed'),
                {
                  errorCode: 'task_status_counts_partial_failure',
                  policy: 'degrade',
                  recoverable: true,
                  message: `Partial task status count failure (${failedQueries.join(', ')})`,
                  cause: { failedQueries, projectId },
                },
              )
            : operationSuccess(
                {
                  processing: processingCount,
                  recentSuccesses: successCount,
                  recentFailures: failureCount,
                },
                { policy: 'best_effort' },
              ),
      };

      // [TasksPaneCountMismatch] Result snapshot to compare with list view

      // Track circuit breaker - if any query failed, record failure; otherwise record success
      const anyFailed = failedQueries.length > 0;

      if (anyFailed) {
        const errorReason = processingResult.status === 'rejected' ? processingResult.reason :
                           successResult.status === 'rejected' ? successResult.reason :
                           failureResult.status === 'rejected' ? failureResult.reason :
                           new Error('Query returned error');
        dataFreshnessManager.onFetchFailure(taskQueryKeys.statusCounts(projectId), errorReason as Error);
      } else {
        dataFreshnessManager.onFetchSuccess(taskQueryKeys.statusCounts(projectId));
      }

      return result;
    },
    enabled: !!projectId,
    // SMART POLLING: Intelligent polling based on realtime health
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
    queryKey: taskQueryKeys.allTypes,
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
