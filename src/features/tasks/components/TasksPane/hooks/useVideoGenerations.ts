import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { Task } from '@/types/tasks';
import { GenerationRow } from '@/domains/generation/types';
import { extractTaskParentGenerationId } from '../utils/task-utils';
import { generationQueryKeys } from '@/shared/lib/queryKeys/generations';
import { findGenerationByVariantLocation } from '../utils/findGenerationByVariantLocation';

interface UseVideoGenerationsOptions {
  task: Task;
  taskParams: { parsed: Record<string, unknown>; promptText: string };
  isVideoTask: boolean;
  isCompletedVideoTask: boolean;
  isHovering: boolean;
}

/**
 * Hook to fetch video generations for video tasks
 * Only fetches when hovering (lazy loading to avoid query spam)
 */
export function useVideoGenerations({
  task,
  taskParams,
  isVideoTask,
  isCompletedVideoTask,
  isHovering,
}: UseVideoGenerationsOptions) {
  // State to control when to fetch video generations (on hover)
  const [shouldFetchVideo, setShouldFetchVideo] = useState(false);

  // State to track if user clicked the button (not just hovered)
  const [waitingForVideoToOpen, setWaitingForVideoToOpen] = useState(false);

  // Trigger video fetch when hovering over completed video tasks
  useEffect(() => {
    if (isHovering && isCompletedVideoTask && !shouldFetchVideo) {
      setShouldFetchVideo(true);
    }
  }, [isHovering, isCompletedVideoTask, shouldFetchVideo, task.id]);

  // Fetch video generations
  const { data: videoGenerations, isLoading: isLoadingVideoGen } = useQuery({
    queryKey: [...generationQueryKeys.videoForTask(task.id), task.outputLocation],
    queryFn: async () => {

      if (!isVideoTask || task.status !== 'Complete') {
        return null;
      }

      // For individual_travel_segment tasks with child_generation_id, fetch that generation directly
      const childGenerationId =
        typeof taskParams.parsed?.child_generation_id === 'string'
          ? taskParams.parsed.child_generation_id
          : null;
      if (task.taskType === 'individual_travel_segment' && childGenerationId) {
        const { data: childGen, error: childError } = await supabase().from('generations')
          .select('*, generation_variants(*)')
          .eq('id', childGenerationId)
          .single();

        if (!childError && childGen) {
          const variants = ((childGen as Record<string, unknown>).generation_variants as Array<{ id: string; location: string; thumbnail_url: string | null; is_primary: boolean; params: Record<string, unknown> | null }>) || [];
          const taskVariant = variants.find((v) => v.params?.source_task_id === task.id);
          const primaryVariant = variants.find((v) => v.is_primary);
          const targetVariant = taskVariant || primaryVariant;

          if (targetVariant) {
            return [{
              ...childGen,
              location: targetVariant.location,
              thumbnail_url: targetVariant.thumbnail_url || childGen.thumbnail_url,
              _variant_id: targetVariant.id,
              _variant_is_primary: targetVariant.is_primary,
            }];
          }
          return [childGen];
        }
      }

      // Try to find generation by output location first (most reliable)
      if (task.outputLocation) {
        const { data: byLocation, error: locError } = await supabase().from('generations')
          .select('*')
          .eq('location', task.outputLocation)
          .eq('project_id', task.projectId);

        if (!locError && byLocation && byLocation.length > 0) {
          return byLocation;
        }

        // If not found in generations, check generation_variants by location
        const variantGeneration = await findGenerationByVariantLocation(task.outputLocation, supabase());
        if (variantGeneration) {
          return [{
            ...variantGeneration.generation,
            _variant_id: variantGeneration.variantId,
            _variant_is_primary: variantGeneration.variantIsPrimary,
          }];
        }
      }

      // Fallback: Search by task ID in the tasks JSONB array
      const { data, error } = await supabase().from('generations')
        .select('*')
        .filter('tasks', 'cs', JSON.stringify([task.id]))
        .eq('project_id', task.projectId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[useVideoGenerations] Error fetching video generations:', error);
        throw error;
      }

      if (data && data.length > 0) {
        return data;
      }

      // FINAL FALLBACK: If no generation record exists but task has outputLocation,
      // create a minimal pseudo-generation from the task data
      // This handles cases where complete-task failed to create the generation record
      if (task.outputLocation) {
        return [{
          id: task.id, // Use task ID as pseudo-generation ID
          location: task.outputLocation,
          thumbnail_url: null,
          type: 'video',
          created_at: task.createdAt,
          project_id: task.projectId,
          params: task.params,
          _is_fallback: true, // Mark as fallback so we know it's not a real generation
        }];
      }

      return [];
    },
    enabled: shouldFetchVideo && isVideoTask && task.status === 'Complete',
  });

  // Transform video generations to GenerationRow format
  const videoOutputs = useMemo(() => {
    if (!videoGenerations) return null;
    
    const taskParentGenerationId = extractTaskParentGenerationId(taskParams.parsed);
    
    return videoGenerations.map((gen) => {
      const genRecord = gen as Record<string, unknown>;
      // Individual segments have their parent_generation_id on the generation itself (from DB)
      // Other video tasks may have it in task params or on the generation
      const effectiveParentGenId = (genRecord.parent_generation_id as string | undefined) || taskParentGenerationId;
      const location = (genRecord.location as string | null | undefined) ?? null;
      const thumbnailUrl = (genRecord.thumbnail_url as string | null | undefined) ?? null;
      const type = (genRecord.type as string | null | undefined) ?? 'video';
      const createdAt =
        (genRecord.created_at as string | null | undefined) ||
        task.createdAt ||
        new Date().toISOString();
      const metadata = (genRecord.params as Record<string, unknown> | undefined) || {};
      const generationId =
        (genRecord.id as string | undefined) ||
        task.id;

      return {
        id: generationId,
        location,
        imageUrl: location,
        thumbUrl: thumbnailUrl || location,
        videoUrl: (genRecord.video_url as string | undefined) || location,
        type,
        createdAt,
        taskId: genRecord.task_id as string | undefined,
        metadata,
        name: (genRecord.name as string | undefined) || undefined,
        parent_generation_id: effectiveParentGenId || undefined,
        _variant_id: genRecord._variant_id as string | undefined,
        _variant_is_primary: genRecord._variant_is_primary as boolean | undefined,
      } as GenerationRow;
    });
  }, [videoGenerations, taskParams.parsed]);

  // Trigger fetch (for click before hover)
  const ensureFetch = useCallback(() => {
    setShouldFetchVideo(true);
  }, []);

  const triggerOpen = useCallback(() => {
    setShouldFetchVideo(true);
    setWaitingForVideoToOpen(true);
  }, []);

  const clearWaiting = () => {
    setWaitingForVideoToOpen(false);
  };

  return {
    videoOutputs,
    isLoadingVideoGen,
    shouldFetchVideo,
    waitingForVideoToOpen,
    ensureFetch,
    triggerOpen,
    clearWaiting,
  };
}
