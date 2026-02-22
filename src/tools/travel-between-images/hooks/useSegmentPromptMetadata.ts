/**
 * Segment Prompt Metadata
 *
 * Hook for pair prompt CRUD operations:
 * - Get pair prompts (derived from shotGenerations metadata)
 * - Update pair prompts (updatePairPrompts)
 * - Clear enhanced prompts (clearEnhancedPrompt)
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toJson } from '@/shared/lib/supabaseTypeHelpers';
import type { ShotGeneration } from '@/shared/hooks/useTimelineCore';
import { GenerationRow } from '@/types/shots';
import { readSegmentOverrides, writeSegmentOverrides } from '@/shared/utils/settingsMigration';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { queryKeys } from '@/shared/lib/queryKeys';

// ============================================================================
// Types
// ============================================================================

interface UseSegmentPromptMetadataOptions {
  shotId: string | null;
  projectId?: string | null;
  shotGenerations: ShotGeneration[];
}

// ============================================================================
// Pure function: extract pair prompts
// ============================================================================

/**
 * Extract pair prompts from sorted positioned generations.
 * Each pair is represented by its first item (index in the sorted array).
 */
export function extractPairPrompts(
  shotGenerations: ShotGeneration[]
): Record<number, { prompt: string; negativePrompt: string }> {
  const pairPrompts: Record<number, { prompt: string; negativePrompt: string }> = {};
  const sortedPositionedGenerations = shotGenerations
    .filter(sg => sg.timeline_frame >= 0)
    .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));

  for (let i = 0; i < sortedPositionedGenerations.length - 1; i++) {
    const firstItem = sortedPositionedGenerations[i];
    const overrides = readSegmentOverrides(firstItem.metadata as Record<string, unknown> | null);
    const prompt = overrides.prompt || "";
    const negativePrompt = overrides.negativePrompt || "";
    if (prompt || negativePrompt) {
      pairPrompts[i] = { prompt, negativePrompt };
    }
  }

  return pairPrompts;
}

// ============================================================================
// Hook
// ============================================================================

export function useSegmentPromptMetadata({
  shotId,
  projectId,
  shotGenerations,
}: UseSegmentPromptMetadataOptions) {
  const queryClient = useQueryClient();

  /**
   * Update pair prompt for a specific pair
   * @param shotGenerationId - The shot_generation.id (NOT generation_id)
   */
  const updatePairPrompts = useCallback(async (
    shotGenerationId: string,
    prompt: string,
    negativePrompt: string
  ) => {
    if (!shotId) {
      throw new Error('No shotId provided');
    }

    // Look up by shot_generation.id
    const shotGen = shotGenerations.find(sg => sg.id === shotGenerationId);
    if (!shotGen?.id) {
      const err = new Error(`Shot generation not found for shot_generation.id ${shotGenerationId}`);
      handleError(err, { context: 'useSegmentPromptMetadata', showToast: false, logData: {
        lookingForShotGenId: shotGenerationId.substring(0, 8),
        availableShotGenIds: shotGenerations.map(sg => sg.id?.substring(0, 8)),
        availableGenerationIds: shotGenerations.map(sg => sg.generation_id?.substring(0, 8)),
      }});
      throw err;
    }

    // Use new format for writing
    const updatedMetadata = writeSegmentOverrides(
      shotGen.metadata as Record<string, unknown> | null,
      {
        prompt: prompt,
        negativePrompt: negativePrompt,
      }
    );
    // Clean up old fields (migration cleanup)
    delete updatedMetadata.pair_prompt;
    delete updatedMetadata.pair_negative_prompt;

    const { error } = await supabase
      .from('shot_generations')
      .update({ metadata: toJson(updatedMetadata) })
      .eq('id', shotGen.id)
      .select();

    if (error) {
      handleError(error, { context: 'useSegmentPromptMetadata', showToast: false });
      throw error;
    }

    // Refetch instead of invalidate
    queryClient.refetchQueries({ queryKey: queryKeys.generations.byShot(shotId) });
    queryClient.refetchQueries({ queryKey: queryKeys.generations.meta(shotId) });
    if (projectId) {
      queryClient.refetchQueries({ queryKey: queryKeys.shots.list(projectId!) });
    }

    // Also invalidate pair-metadata cache used by useSegmentSettings modal
    queryClient.invalidateQueries({ queryKey: queryKeys.segments.pairMetadata(shotGen.id) });

  }, [shotId, shotGenerations, queryClient, projectId]);

  /**
   * Clear enhanced prompt for a generation
   * @param shotGenerationId - The shot_generation.id (NOT generation_id)
   */
  const clearEnhancedPrompt = useCallback(async (shotGenerationId: string) => {
    if (!shotId) {
      throw new Error('No shotId provided');
    }

    // Look up by shot_generation.id
    const shotGen = shotGenerations.find(sg => sg.id === shotGenerationId);
    if (!shotGen?.id) {
      const err = new Error(`Shot generation not found for shot_generation.id ${shotGenerationId}`);
      handleError(err, { context: 'useSegmentPromptMetadata', showToast: false, logData: {
        lookingForShotGenId: shotGenerationId.substring(0, 8),
        availableShotGenIds: shotGenerations.map(sg => sg.id?.substring(0, 8)),
      }});
      throw err;
    }

    const existingMetadata = shotGen.metadata || {};
    const { enhanced_prompt, ...restMetadata } = existingMetadata;

    // Optimistic update: immediately update the cache
    queryClient.setQueryData<GenerationRow[]>(
      queryKeys.generations.byShot(shotId),
      (oldData) => {
        if (!oldData) return oldData;
        return oldData.map((row) =>
          row.id === shotGenerationId
            ? { ...row, metadata: restMetadata }
            : row
        );
      }
    );

    // Persist to database
    const { error } = await supabase
      .from('shot_generations')
      .update({ metadata: toJson(restMetadata) })
      .eq('id', shotGen.id);

    if (error) {
      handleError(error, { context: 'useSegmentPromptMetadata', showToast: false });
      // Revert by refetching
      queryClient.refetchQueries({ queryKey: queryKeys.generations.byShot(shotId) });
      throw error;
    }

    queryClient.refetchQueries({ queryKey: queryKeys.generations.byShot(shotId) });
    queryClient.refetchQueries({ queryKey: queryKeys.generations.meta(shotId) });
    if (projectId) {
      queryClient.refetchQueries({ queryKey: queryKeys.shots.list(projectId!) });
    }

    // Also invalidate pair-metadata cache used by useSegmentSettings modal
    queryClient.invalidateQueries({ queryKey: queryKeys.segments.pairMetadata(shotGenerationId) });

  }, [shotId, shotGenerations, queryClient, projectId]);

  return {
    updatePairPrompts,
    clearEnhancedPrompt,
  };
}
