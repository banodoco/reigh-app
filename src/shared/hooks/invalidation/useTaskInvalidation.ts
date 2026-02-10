/**
 * useTaskInvalidation.ts
 *
 * Centralized hook for invalidating task-related React Query caches.
 *
 * Scopes:
 * - 'list': Task list for a project
 * - 'detail': Specific task
 * - 'counts': Just status counts (lightweight)
 * - 'all': Everything task-related
 */

import { useQueryClient, QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryKeys } from '../../lib/queryKeys';
import { invalidateGenerationsSync } from './useGenerationInvalidation';

export type TaskInvalidationScope = 'list' | 'detail' | 'counts' | 'all';

export interface TaskInvalidationOptions {
  /** Which queries to invalidate */
  scope?: TaskInvalidationScope;
  /** Debug reason for logging. Required for traceability. */
  reason: string;
  /** Task ID - required for 'detail' scope */
  taskId?: string;
  /** Project ID - required for 'list', 'counts', and 'all' scopes */
  projectId?: string;
  /** Also invalidate generation caches (for task completion) */
  includeGenerations?: boolean;
  /** Shot ID - required if includeGenerations is true */
  shotId?: string;
}

/**
 * Internal helper that performs the actual invalidation.
 */
function performTaskInvalidation(
  queryClient: QueryClient,
  options: TaskInvalidationOptions
): void {
  const { scope = 'all', reason, taskId, projectId, includeGenerations, shotId } = options;

  if ((scope === 'list' || scope === 'all') && projectId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.list(projectId) });
  }

  if ((scope === 'detail' || scope === 'all') && taskId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(taskId) });
  }

  if ((scope === 'counts' || scope === 'all') && projectId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.statusCounts(projectId) });
  }

  // Task completion often means new generations
  if (includeGenerations && shotId) {
    invalidateGenerationsSync(queryClient, shotId, {
      reason: `${reason} (task completion)`,
      scope: 'all',
    });
  }
}

/**
 * Hook that returns a stable task invalidation function.
 * Use this in React components/hooks.
 *
 * @internal Not exported - currently unused. If needed in the future,
 * add export back and update the barrel file.
 */
function useInvalidateTasks() {
  const queryClient = useQueryClient();

  return useCallback((options: TaskInvalidationOptions) => {
    performTaskInvalidation(queryClient, options);
  }, [queryClient]);
}

// Keep for potential future use
void useInvalidateTasks;

/**
 * Non-hook version for use outside React components.
 * Requires passing in the queryClient.
 *
 * @internal Not exported - currently unused. If needed in the future,
 * add export back and update the barrel file.
 */
function invalidateTasksSync(
  queryClient: QueryClient,
  options: TaskInvalidationOptions
): void {
  performTaskInvalidation(queryClient, options);
}

// Keep for potential future use
void invalidateTasksSync;
