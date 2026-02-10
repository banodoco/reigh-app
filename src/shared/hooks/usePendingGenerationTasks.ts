/**
 * usePendingGenerationTasks Hook
 *
 * Tracks tasks that are "Queued" or "In Progress" that will create
 * variants or derived generations from a given source generation.
 *
 * Works for both images and videos - checks task params for source generation references.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TASK_STATUS } from '@/types/tasks';
import { queryKeys } from '@/shared/lib/queryKeys';

interface PendingGenerationTask {
  id: string;
  status: string;
  task_type: string;
}

export interface UsePendingGenerationTasksReturn {
  /** Number of pending tasks that will create variants/derived from this generation */
  pendingCount: number;
  /** The pending tasks */
  pendingTasks: PendingGenerationTask[];
  /** Loading state */
  isLoading: boolean;
}

/**
 * Check if task params reference a specific generation ID as a source.
 * Checks common param fields where source generation is stored.
 */
function taskReferencesGeneration(params: Record<string, unknown> | null, generationId: string): boolean {
  if (!params || !generationId) return false;

  // Direct source references
  if (params.based_on === generationId) return true;
  if (params.source_generation_id === generationId) return true;
  if (params.generation_id === generationId) return true;
  if (params.input_generation_id === generationId) return true;
  if (params.parent_generation_id === generationId) return true;
  // Video segment tasks use pair_shot_generation_id
  if (params.pair_shot_generation_id === generationId) return true;

  // Check nested in orchestrator_details
  const orchDetails = params.orchestrator_details as Record<string, unknown> | undefined;
  if (orchDetails) {
    if (orchDetails.based_on === generationId) return true;
    if (orchDetails.source_generation_id === generationId) return true;
    if (orchDetails.parent_generation_id === generationId) return true;
    // Check pair_shot_generation_ids array
    if (Array.isArray(orchDetails.pair_shot_generation_ids)) {
      if (orchDetails.pair_shot_generation_ids.includes(generationId)) return true;
    }
  }

  // Check full_orchestrator_payload
  const fullPayload = params.full_orchestrator_payload as Record<string, unknown> | undefined;
  if (fullPayload) {
    if (fullPayload.based_on === generationId) return true;
    if (fullPayload.source_generation_id === generationId) return true;
    if (fullPayload.parent_generation_id === generationId) return true;
  }

  // Check individual_segment_params (used by individual_travel_segment)
  const individualParams = params.individual_segment_params as Record<string, unknown> | undefined;
  if (individualParams) {
    if (individualParams.pair_shot_generation_id === generationId) return true;
  }

  return false;
}

export function usePendingGenerationTasks(
  generationId: string | null | undefined,
  projectId: string | null | undefined
): UsePendingGenerationTasksReturn {
  // Query pending tasks for this project
  const { data: pendingTasks, isLoading } = useQuery({
    queryKey: [...queryKeys.tasks.pendingGeneration(generationId!), projectId],
    queryFn: async () => {
      if (!generationId || !projectId) return [];

      const queryStartTime = Date.now();

      // Query tasks that are Queued or In Progress
      const { data, error } = await supabase
        .from('tasks')
        .select('id, status, task_type, params')
        .eq('project_id', projectId)
        .in('status', [TASK_STATUS.QUEUED, TASK_STATUS.IN_PROGRESS]);

      if (error) {
        console.error('[usePendingGenerationTasks] Query error:', error);
        return [];
      }

      // Filter to tasks that reference this generation
      const matchingTasks: PendingGenerationTask[] = (data || [])
        .filter(task => taskReferencesGeneration(task.params as Record<string, unknown> | null, generationId))
        .map(task => ({
          id: task.id,
          status: task.status,
          task_type: task.task_type,
        }));

      return matchingTasks;
    },
    enabled: !!generationId && !!projectId,
    // Poll to catch status changes
    refetchInterval: 5000,
    // Mark as stale immediately so invalidations trigger refetch
    staleTime: 0,
    // Short cache time - don't keep stale data around
    gcTime: 10000,
    // Always refetch when window regains focus
    refetchOnWindowFocus: 'always',
  });

  const result = useMemo(() => ({
    pendingCount: pendingTasks?.length || 0,
    pendingTasks: pendingTasks || [],
    isLoading,
  }), [pendingTasks, isLoading]);

  return result;
}

// NOTE: Default export removed - use named export { usePendingGenerationTasks } instead
