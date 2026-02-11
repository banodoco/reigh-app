import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getVisibleTaskTypes } from '@/shared/lib/taskConfig';
import { useSmartPollingConfig } from '@/shared/hooks/useSmartPolling';
import { QUERY_PRESETS, STANDARD_RETRY, STANDARD_RETRY_DELAY } from '@/shared/lib/queryDefaults';
import { queryKeys } from '@/shared/lib/queryKeys';
import { dataFreshnessManager } from '@/shared/realtime/DataFreshnessManager';
import { handleError } from '@/shared/lib/errorHandler';

// Hook to get status counts for indicators
export const useTaskStatusCounts = (projectId: string | null) => {
  // SMART POLLING: Use DataFreshnessManager for intelligent polling decisions
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
          handleError(error, { context: 'useTaskStatusCounts.processing', showToast: false, logData: { projectId } });
        } else {
          processingCount = count || 0;
        }
      } else {
        handleError(processingResult.reason instanceof Error ? processingResult.reason : new Error(String(processingResult.reason)), { context: 'useTaskStatusCounts.processing', showToast: false, logData: { projectId } });
      }

      // Handle success count result
      let successCount = 0;
      if (successResult.status === 'fulfilled') {
        const { count, error } = successResult.value;
        if (error) {
          handleError(error, { context: 'useTaskStatusCounts.success', showToast: false, logData: { projectId } });
        } else {
          successCount = count || 0;
        }
      } else {
        handleError(successResult.reason instanceof Error ? successResult.reason : new Error(String(successResult.reason)), { context: 'useTaskStatusCounts.success', showToast: false, logData: { projectId } });
      }

      // Handle failure count result
      let failureCount = 0;
      if (failureResult.status === 'fulfilled') {
        const { count, error } = failureResult.value;
        if (error) {
          handleError(error, { context: 'useTaskStatusCounts.failure', showToast: false, logData: { projectId } });
        } else {
          failureCount = count || 0;
        }
      } else {
        handleError(failureResult.reason instanceof Error ? failureResult.reason : new Error(String(failureResult.reason)), { context: 'useTaskStatusCounts.failure', showToast: false, logData: { projectId } });
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
