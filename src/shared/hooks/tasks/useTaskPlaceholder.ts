/**
 * useTaskPlaceholder — Collapse placeholder lifecycle to one call.
 *
 * Every task-creation callsite needs the same 5-step ceremony:
 *   addIncomingTask → create → resolveTaskIds → refetch → removeIncomingTask
 * This hook wraps that into a single `run()` function.
 *
 * Also handles mid-flight cancellation: if cancelAllIncoming() is called
 * while create() is in flight, the newly created tasks are cancelled in DB.
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { requireSession } from '@/integrations/supabase/auth/ensureAuthenticatedSession';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { invokeSupabaseEdgeFunction } from '@/integrations/supabase/functions/invokeSupabaseEdgeFunction';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';

interface TaskPlaceholderOptions {
  taskType: string;
  label: string;
  expectedCount?: number;
  context: string;
  toastTitle: string;
  create: () => Promise<unknown>;
  /** Extra work after task IDs are resolved (e.g. invalidateQueries). */
  onSuccess?: (taskIds: string[]) => void | Promise<void>;
}

/**
 * Extract task IDs from whatever shape the create() function returns.
 *
 * Handles:
 *  - string                        → raw task_id
 *  - string[]                      → array of raw task_ids
 *  - { task_id: string }           → single TaskCreationResult
 *  - Array<{ task_id: string }>    → batch results
 *  - mixed arrays of strings and objects
 *  - void/null/undefined           → [] (graceful degradation)
 */
export function extractTaskIds(result: unknown): string[] {
  if (result == null) return [];

  if (typeof result === 'string') return [result];

  if (Array.isArray(result)) {
    return result.flatMap(item => {
      if (typeof item === 'string') return [item];
      if (item != null && typeof item === 'object' && 'task_id' in item) {
        const id = (item as { task_id: unknown }).task_id;
        if (typeof id === 'string') return [id];
      }
      return [];
    });
  }

  if (typeof result === 'object' && 'task_id' in result) {
    const id = (result as { task_id: unknown }).task_id;
    if (typeof id === 'string') return [id];
  }

  return [];
}

/** Cancel specific task IDs through the audited task-status edge path. */
async function cancelTasksByIds(taskIds: string[]): Promise<void> {
  if (taskIds.length === 0) return;

  const session = await requireSession(supabase(), 'useTaskPlaceholder.cancelTasksByIds');
  const results = await Promise.allSettled(taskIds.map((taskId) => (
    invokeSupabaseEdgeFunction('update-task-status', {
      body: {
        task_id: taskId,
        status: 'Cancelled',
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      timeoutMs: 20000,
    })
  )));

  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (rejected) {
    normalizeAndPresentError(rejected.reason, {
      context: 'useTaskPlaceholder.cancelTasksByIds',
      showToast: false,
    });
  }
}

export type RunTaskPlaceholder = (options: TaskPlaceholderOptions) => Promise<void>;

/**
 * Returns a stable `run` function that wraps the full placeholder lifecycle.
 *
 * Usage:
 * ```ts
 * const run = useTaskPlaceholder();
 * await run({
 *   taskType: 'image-upscale', label: 'Upscale 2x',
 *   context: 'useUpscale', toastTitle: 'Upscale failed',
 *   create: () => createImageUpscaleTask(params),
 * });
 * ```
 */
export function useTaskPlaceholder(): RunTaskPlaceholder {
  const { addIncomingTask, removeIncomingTask, resolveTaskIds, wasCancelled, acknowledgeCancellation } = useIncomingTasks();
  const queryClient = useQueryClient();

  return useCallback(async (options: TaskPlaceholderOptions) => {
    const incomingTaskId = addIncomingTask({
      taskType: options.taskType,
      label: options.label,
      expectedCount: options.expectedCount,
    });

    try {
      const result = await options.create();
      const taskIds = extractTaskIds(result);

      // If cancelled while create() was in flight, cancel the newly created tasks.
      if (wasCancelled(incomingTaskId)) {
        if (taskIds.length > 0) {
          await cancelTasksByIds(taskIds);
        }
        acknowledgeCancellation(incomingTaskId);
        return; // finally block still runs for refetch + cleanup
      }

      if (taskIds.length > 0) {
        resolveTaskIds(incomingTaskId, taskIds);
      }

      await options.onSuccess?.(taskIds);
    } catch (error) {
      if (wasCancelled(incomingTaskId)) {
        acknowledgeCancellation(incomingTaskId);
        return; // Swallow errors from cancelled tasks
      }
      normalizeAndPresentError(error, { context: options.context, toastTitle: options.toastTitle });
    } finally {
      await queryClient.refetchQueries({ queryKey: taskQueryKeys.paginatedAll });
      await queryClient.refetchQueries({ queryKey: taskQueryKeys.statusCountsAll });
      // Safe even if already removed by cancelAllIncoming — filter is a no-op
      removeIncomingTask(incomingTaskId);
    }
  }, [addIncomingTask, removeIncomingTask, resolveTaskIds, queryClient, wasCancelled, acknowledgeCancellation]);
}
