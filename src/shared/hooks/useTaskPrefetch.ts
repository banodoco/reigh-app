/**
 * useTaskPrefetch.ts
 *
 * Utilities for prefetching task data for generations.
 * Used for hover prefetch in galleries and lightboxes.
 *
 * These hooks use immutable caching since generation→task mapping never changes once created.
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { mapDbTaskToTask } from './useTasks';
import { queryKeys } from '@/shared/lib/queryKeys';

/**
 * Hook for getting task data from cache for a generation.
 * Uses immutable caching since generation→task mapping never changes once created.
 *
 * @param generationId - The generation ID to get task data for
 * @returns Query result with { taskId: string | null }
 */
export function useTaskFromUnifiedCache(generationId: string) {
  const result = useQuery({
    queryKey: queryKeys.tasks.generationTaskId(generationId),
    queryFn: async () => {
      // Fetch task ID from generations table
      // Note: React Query won't call this if data is cached (staleTime: Infinity)
      const { data, error } = await supabase
        .from('generations')
        .select('tasks')
        .eq('id', generationId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      // Return null taskId if generation doesn't exist or has no tasks
      if (!data) {
        return { taskId: null };
      }

      const taskId = Array.isArray(data?.tasks) && data.tasks.length > 0 ? data.tasks[0] : null;
      return { taskId };
    },
    // Generation→task mapping is immutable - cache aggressively
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !!generationId,
  });

  return result;
}

/**
 * Hook to prefetch task data for a generation on hover.
 * Returns a function that can be called onMouseEnter to prefetch
 * both the task ID mapping and the full task data.
 */
export function usePrefetchTaskData() {
  const queryClient = useQueryClient();

  const prefetch = useCallback(async (generationId: string) => {
    if (!generationId) return;

    // Check if task ID mapping is already cached (including { taskId: null } for no-task generations)
    let taskId: string | null = null;
    const cachedMapping = queryClient.getQueryData(queryKeys.tasks.generationTaskId(generationId)) as { taskId: string | null } | undefined;

    if (cachedMapping !== undefined) {
      // Already cached - use the cached value (could be null if no task)
      taskId = cachedMapping.taskId;
    } else {
      // Not cached - fetch the task ID mapping
      try {
        const result = await queryClient.fetchQuery({
          queryKey: queryKeys.tasks.generationTaskId(generationId),
          queryFn: async () => {
            const { data, error } = await supabase
              .from('generations')
              .select('tasks')
              .eq('id', generationId)
              .maybeSingle();

            if (error) throw error;
            if (!data) return { taskId: null };

            const fetchedTaskId = Array.isArray(data?.tasks) && data.tasks.length > 0 ? data.tasks[0] : null;
            return { taskId: fetchedTaskId };
          },
          staleTime: Infinity,
        });
        taskId = result?.taskId ?? null;
      } catch {
        return;
      }
    }

    // Prefetch the full task data if we have a task ID and it's not cached
    if (taskId) {
      const cachedTask = queryClient.getQueryData(queryKeys.tasks.single(taskId));
      if (!cachedTask) {
        try {
          await queryClient.fetchQuery({
            queryKey: queryKeys.tasks.single(taskId),
            queryFn: async () => {
              const { data, error } = await supabase
                .from('tasks')
                .select('*')
                .eq('id', taskId)
                .single();

              if (error) throw error;
              // Transform to match useGetTask format
              return mapDbTaskToTask(data);
            },
            staleTime: Infinity,
          });
        } catch {
          // Silently fail - prefetch is best-effort
        }
      }
    }
  }, [queryClient]);

  return prefetch;
}

/**
 * Hook to prefetch a task directly by task ID.
 * Use this when you already have the task ID (e.g., from variant.params.source_task_id).
 */
export function usePrefetchTaskById() {
  const queryClient = useQueryClient();

  const prefetch = useCallback(async (taskId: string) => {
    if (!taskId) return;

    // Check if already cached
    const cached = queryClient.getQueryData(queryKeys.tasks.single(taskId));
    if (cached) {
      return;
    }

    try {
      await queryClient.fetchQuery({
        queryKey: queryKeys.tasks.single(taskId),
        queryFn: async () => {
          const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('id', taskId)
            .single();

          if (error) throw error;
          return mapDbTaskToTask(data);
        },
        staleTime: Infinity,
      });
    } catch {
      // Silently fail - prefetch is best-effort
    }
  }, [queryClient]);

  return prefetch;
}
