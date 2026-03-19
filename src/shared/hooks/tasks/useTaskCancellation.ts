import { useMutation, useQueryClient } from '@tanstack/react-query';
import { requireSession } from '@/integrations/supabase/auth/ensureAuthenticatedSession';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { invokeSupabaseEdgeFunction } from '@/integrations/supabase/functions/invokeSupabaseEdgeFunction';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';

async function updateTaskStatusToCancelled(taskId: string, accessToken: string): Promise<void> {
  await invokeSupabaseEdgeFunction('update-task-status', {
    body: {
      task_id: taskId,
      status: 'Cancelled',
    },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    timeoutMs: 20000,
  });
}

/**
 * Cancel a task via the audited task-status edge path.
 * For orchestrator tasks (travel_orchestrator, join_clips_orchestrator, etc.), also cancels all subtasks
 */
async function cancelTask(taskId: string): Promise<void> {
  // First, get the task to check if it's an orchestrator
  const { data: task, error: fetchError } = await supabase().from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch task: ${fetchError.message}`);
  }

  // Already in a terminal state — treat as a no-op success
  if (task.status !== 'Queued' && task.status !== 'In Progress') {
    return;
  }

  const session = await requireSession(supabase(), 'useCancelTask.cancelTask');
  await updateTaskStatusToCancelled(taskId, session.access_token);

  // If it's an orchestrator task, cancel all subtasks
  if (task && task.task_type?.includes('orchestrator')) {
    // Find all subtasks that reference this orchestrator
    const { data: subtasks, error: subtaskFetchError } = await supabase().from('tasks')
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
        await Promise.allSettled(subtaskIds.map((id) => updateTaskStatusToCancelled(id, session.access_token)));
      }
    }
  }
}

// Hook to cancel a task using Supabase
export const useCancelTask = (_projectId: string | null) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelTask,
    onSuccess: () => {
      // Immediately invalidate tasks queries so cancelled task disappears
      queryClient.invalidateQueries({ queryKey: taskQueryKeys.paginatedAll });
      queryClient.invalidateQueries({ queryKey: taskQueryKeys.statusCountsAll });
      // Immediately invalidate pending task queries so indicators update instantly
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'pending-segment-tasks' ||
          query.queryKey[0] === 'pending-generation-tasks'
      });
    },
    onError: (error: Error) => {
      console.error('[useCancelTask] Raw error from server:', error.message, error);
      normalizeAndPresentError(error, { context: 'useCancelTask', toastTitle: 'Failed to cancel task' });
    },
  });
};

interface CancelAllPendingTasksResponse {
  cancelledCount: number;
  message: string;
}

/**
 * Cancel all pending tasks for a project via the audited task-status edge path.
 * For orchestrator tasks (travel_orchestrator, join_clips_orchestrator, etc.), also cancels their subtasks
 */
async function cancelPendingTasks(projectId: string): Promise<CancelAllPendingTasksResponse> {
  // Get all pending tasks with type and params in a single query
  const { data: pendingTasks, error: fetchError } = await supabase().from('tasks')
    .select('id, task_type, params')
    .eq('project_id', projectId)
    .in('status', ['Queued']);

  if (fetchError) {
    throw new Error(`Failed to fetch pending tasks: ${fetchError.message}`);
  }

  // Collect all task IDs to cancel (including subtasks)
  const tasksToCancel = new Set<string>();

  // Add all pending tasks
  pendingTasks?.forEach(task => tasksToCancel.add(task.id));

  // Find orchestrator tasks and their subtasks
  const orchestratorIds = pendingTasks
    ?.filter(task => task.task_type?.includes('orchestrator'))
    .map(task => task.id) || [];

  if (orchestratorIds.length > 0) {
    pendingTasks?.forEach(task => {
      const params = task.params as Record<string, unknown> | null;
      const orchestratorRef = params?.orchestrator_task_id_ref || params?.orchestrator_task_id;

      if (typeof orchestratorRef === 'string' && orchestratorIds.includes(orchestratorRef)) {
        tasksToCancel.add(task.id);
      }
    });
  }

  // Cancel all collected tasks
  const taskIdsArray = Array.from(tasksToCancel);

  if (taskIdsArray.length > 0) {
    const session = await requireSession(supabase(), 'useCancelPendingTasks.cancelPendingTasks');
    await Promise.allSettled(taskIdsArray.map((taskId) => updateTaskStatusToCancelled(taskId, session.access_token)));
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
    onSuccess: () => {
      // Immediately invalidate tasks queries so cancelled tasks disappear
      queryClient.invalidateQueries({ queryKey: taskQueryKeys.paginatedAll });
      queryClient.invalidateQueries({ queryKey: taskQueryKeys.statusCountsAll });
    },
    onError: (error: Error) => {
      normalizeAndPresentError(error, { context: 'useCancelPendingTasks', toastTitle: 'Failed to cancel pending tasks' });
    },
  });
};

// Export alias for backward compatibility
export const useCancelAllPendingTasks = useCancelPendingTasks;
