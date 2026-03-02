import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';

/**
 * Cancel a task using direct Supabase call
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

  // Check if task can be cancelled (only Queued tasks can be cancelled from UI)
  if (task.status !== 'Queued' && task.status !== 'In Progress') {
    throw new Error(`Task is already ${task.status}`);
  }

  // Cancel the main task - use .select() to verify the update happened
  const { data: updatedTask, error: cancelError } = await supabase().from('tasks')
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
    const err = new Error('Task cancellation failed - status not updated');
    normalizeAndPresentError(err, { context: 'useCancelTask', showToast: false, logData: { updatedTask } });
    throw err;
  }

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
        // Cancel all subtasks
        const { error: subtaskCancelError } = await supabase().from('tasks')
          .update({
            status: 'Cancelled',
            updated_at: new Date().toISOString()
          })
          .in('id', subtaskIds);

        if (subtaskCancelError) {
          normalizeAndPresentError(subtaskCancelError, { context: 'useCancelTask', showToast: false });
        }
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
      normalizeAndPresentError(error, { context: 'useCancelTask', toastTitle: 'Failed to cancel task' });
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
  const { data: pendingTasks, error: fetchError } = await supabase().from('tasks')
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
    const { data: allProjectTasks, error: allTasksError } = await supabase().from('tasks')
      .select('id, params')
      .eq('project_id', projectId)
      .in('status', ['Queued']);

    if (!allTasksError && allProjectTasks) {
      allProjectTasks.forEach(task => {
        const params = task.params as Record<string, unknown> | null;
        const orchestratorRef = params?.orchestrator_task_id_ref || params?.orchestrator_task_id;

        if (typeof orchestratorRef === 'string' && orchestratorIds.includes(orchestratorRef)) {
          tasksToCancel.add(task.id);
        }
      });
    }
  }

  // Cancel all collected tasks
  const taskIdsArray = Array.from(tasksToCancel);

  if (taskIdsArray.length > 0) {
    const { error: cancelError } = await supabase().from('tasks')
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
