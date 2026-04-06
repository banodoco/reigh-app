/**
 * Shot-generation link operations: add, remove, reorder images within shots.
 * These operate on the shot_generations junction table.
 *
 * Helpers live in ./shotMutationHelpers.ts
 * useDuplicateAsNewGeneration lives in ./useDuplicateAsNewGeneration.ts
 */

import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { GenerationRow } from '@/domains/generation/types';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { enqueueGenerationsInvalidation } from '@/shared/hooks/invalidation';
import { queryKeys } from '@/shared/lib/queryKeys';
import {
  cancelShotsQueries,
  findShotsCache,
  updateAllShotsCaches,
  rollbackShotsCaches,
  rollbackShotGenerationsCache,
  cancelShotGenerationsQuery
} from './cacheUtils';
import {
  runAddImageMutation,
  toAddImageErrorMessage,
  withVariableMetadata,
  type AddImageToShotVariables,
} from './addImageToShotHelpers';
import { persistTimelineFrameBatch } from '@/shared/lib/timelineFrameBatchPersist';

// Re-export useDuplicateAsNewGeneration for backwards compatibility
export { useDuplicateAsNewGeneration } from './useDuplicateAsNewGeneration';

// ============================================================================
// ADD IMAGE TO SHOT (unified hook)
// ============================================================================

type AddImageToShotWithoutPositionVariables = Omit<
  AddImageToShotVariables,
  'timelineFrame'
>;

function withUnpositionedAddImageVariables(
  variables: AddImageToShotWithoutPositionVariables,
): AddImageToShotVariables {
  return {
    ...variables,
    timelineFrame: null,
  };
}

/**
 * Add a generation to a shot.
 *
 * This is the unified hook that handles both positioned and unpositioned additions:
 * - timelineFrame: undefined → auto-calculate position
 * - timelineFrame: null → add without position (appears in unpositioned section)
 * - timelineFrame: number → use explicit position
 */
export const useAddImageToShot = () => {
  const queryClient = useQueryClient();
  const mutation = useMutation<Record<string, unknown>, Error, AddImageToShotVariables>({
    mutationFn: async (variables: AddImageToShotVariables) => {
      const data = await runAddImageMutation(variables);
      return withVariableMetadata(data, variables);
    },

    onError: (error: Error) => {
      // Check for duplicate key constraint
      const isDuplicateError =
        error.message?.includes('unique_shot_generation_pair') ||
        error.message?.includes('duplicate key value');

      if (isDuplicateError) {
        toast.error('Database error: unexpected constraint. Please try again.');
        return;
      }

      toast.error(`Failed to add image to shot: ${toAddImageErrorMessage(error)}`);
    },

    onSuccess: (_data, variables) => {
      const { project_id, shot_id } = variables;

      enqueueGenerationsInvalidation(queryClient, shot_id, {
        reason: 'add-image-to-shot',
        scope: 'all',
        includeShots: true,
        projectId: project_id,
        includeProjectUnified: true,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.segments.liveTimeline(shot_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.segments.parents(shot_id, project_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.generations.meta(shot_id) });
    },
  });

  const mutateAsyncWithoutPosition = useCallback(
    (variables: AddImageToShotWithoutPositionVariables) =>
      mutation.mutateAsync(withUnpositionedAddImageVariables(variables)),
    [mutation],
  );

  const mutateWithoutPosition = useCallback(
    (variables: AddImageToShotWithoutPositionVariables) =>
      mutation.mutate(withUnpositionedAddImageVariables(variables)),
    [mutation],
  );

  return {
    ...mutation,
    mutateAsyncWithoutPosition,
    mutateWithoutPosition,
  };
};

// ============================================================================
// REMOVE IMAGE FROM SHOT
// ============================================================================

/**
 * Remove image from shot's timeline (sets timeline_frame = NULL).
 * This does NOT delete the shot_generations record - just removes the position.
 */
export const useRemoveImageFromShot = () => {
  const queryClient = useQueryClient();
  const log = import.meta.env.DEV ? (...args: Parameters<typeof console.log>) => console.log(...args) : () => {};

  return useMutation({
    mutationFn: async ({
      shotId,
      shotGenerationId,
      projectId,
      shiftItems,
    }: {
      shotId: string;
      shotGenerationId: string;
      projectId: string;
      /** When deleting the first item, shift remaining items back */
      shiftItems?: Array<{ id: string; newFrame: number }>;
    }) => {
      if (!shotId || !shotGenerationId || !projectId) {
        throw new Error(`Missing required parameters`);
      }

      const { error } = await supabase().from('shot_generations')
        .update({ timeline_frame: null })
        .eq('id', shotGenerationId);

      if (error) {
        throw error;
      }

      // Persist frame shifts (optimistic update already applied in onMutate)
      if (shiftItems && shiftItems.length > 0) {
        await persistTimelineFrameBatch({
          shotId,
          updates: shiftItems.map((item) => ({
            shotGenerationId: item.id,
            timelineFrame: item.newFrame,
            metadata: { user_positioned: true, drag_source: 'remove-shift' },
          })),
          operationLabel: 'remove-image-shift',
          timeoutOperationName: 'remove-image-shift-rpc',
          logPrefix: '[ShotGenerationMutations]',
          log,
        });
      }

      return { shotId, shotGenerationId, projectId };
    },

    onMutate: async (variables) => {
      const { shotId, shotGenerationId, projectId, shiftItems } = variables;

      await cancelShotsQueries(queryClient, projectId);
      await cancelShotGenerationsQuery(queryClient, shotId);

      const previousShots = findShotsCache(queryClient, projectId);
      const previousFastGens = queryClient.getQueryData<GenerationRow[]>(
        queryKeys.generations.byShot(shotId)
      );

      // Build a shift lookup for items that need frame updates
      const shiftMap = new Map(shiftItems?.map(s => [s.id, s.newFrame]) ?? []);

      // Optimistically: set timeline_frame = null on deleted item + shift remaining
      if (previousFastGens) {
        queryClient.setQueryData(
          queryKeys.generations.byShot(shotId),
          previousFastGens.map(g => {
            if (g.id === shotGenerationId) return { ...g, timeline_frame: null };
            const shifted = shiftMap.get(g.id);
            if (shifted !== undefined) return { ...g, timeline_frame: shifted };
            return g;
          })
        );
      }

      if (previousShots) {
        updateAllShotsCaches(queryClient, projectId, (shots = []) =>
          shots.map(shot => {
            if (shot.id === shotId) {
              return {
                ...shot,
                images: (shot.images ?? []).map(img => {
                  if (img.id === shotGenerationId) return { ...img, timeline_frame: null };
                  const shifted = shiftMap.get(img.id);
                  if (shifted !== undefined) return { ...img, timeline_frame: shifted };
                  return img;
                }),
              };
            }
            return shot;
          })
        );
      }

      return { previousShots, previousFastGens, projectId, shotId };
    },

    onError: (err: Error, _variables, context) => {
      if (context?.previousShots && context.projectId) {
        rollbackShotsCaches(queryClient, context.projectId, context.previousShots);
      }
      if (context?.previousFastGens && context.shotId) {
        rollbackShotGenerationsCache(queryClient, context.shotId, context.previousFastGens);
      }

      toast.error(`Failed to remove image from timeline: ${err.message}`);
    },

    onSuccess: (data) => {
      // Invalidate segment queries
      queryClient.invalidateQueries({ queryKey: queryKeys.segments.liveTimeline(data.shotId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.segments.parents(data.shotId, data.projectId),
      });
    },
  });
};

// ============================================================================
// UPDATE SHOT IMAGE ORDER
// ============================================================================

export const useUpdateShotImageOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      updates,
      projectId,
      shotId,
    }: {
      updates: { shot_id: string; generation_id: string; timeline_frame: number }[];
      projectId: string;
      shotId: string;
    }) => {
      const promises = updates.map(update =>
        supabase().from('shot_generations')
          .update({ timeline_frame: update.timeline_frame })
          .eq('shot_id', update.shot_id)
          .eq('generation_id', update.generation_id)
      );

      const results = await Promise.all(promises);

      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        throw new Error(`Reorder failed: ${errors.map(e => e.error?.message).join(', ')}`);
      }

      return { projectId, shotId, updates };
    },

    onMutate: async (variables) => {
      const { updates, shotId } = variables;

      await cancelShotGenerationsQuery(queryClient, shotId);

      const previousFastGens = queryClient.getQueryData<GenerationRow[]>(
        queryKeys.generations.byShot(shotId)
      );

      if (previousFastGens) {
        const updatedGens = previousFastGens.map(gen => {
          const update = updates.find(u => u.generation_id === gen.generation_id);
          if (update) {
            return { ...gen, timeline_frame: update.timeline_frame };
          }
          return gen;
        });

        updatedGens.sort((a, b) => (a.timeline_frame || 0) - (b.timeline_frame || 0));
        queryClient.setQueryData(queryKeys.generations.byShot(shotId), updatedGens);
      }

      return { previousFastGens, shotId };
    },

    onError: (_err: Error, _variables, context) => {
      if (context?.previousFastGens && context.shotId) {
        rollbackShotGenerationsCache(queryClient, context.shotId, context.previousFastGens);
      }

      toast.error('Failed to reorder images');
    },

    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.generations.meta(data.shotId) });
      queryClient.invalidateQueries({
        predicate: query => query.queryKey[0] === 'source-slot-generations',
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.segments.liveTimeline(data.shotId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.segments.parents(data.shotId, data.projectId) });
    },
  });
};

// ============================================================================
// POSITION EXISTING GENERATION IN SHOT
// ============================================================================

/**
 * Position an existing generation that has NULL timeline_frame.
 */
export const usePositionExistingGenerationInShot = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      shot_id,
      generation_id,
      project_id,
    }: {
      shot_id: string;
      generation_id: string;
      project_id: string;
    }) => {
      const { data, error } = await supabase().rpc('add_generation_to_shot', {
        p_shot_id: shot_id,
        p_generation_id: generation_id,
        p_with_position: true,
      });

      if (error) {
        throw error;
      }

      return { shot_id, generation_id, project_id, data };
    },

    onSuccess: (data) => {
      enqueueGenerationsInvalidation(queryClient, data.shot_id, {
        reason: 'add-image-to-shot',
        scope: 'all',
        includeShots: true,
        projectId: data.project_id,
        includeProjectUnified: true,
      });
    },

    onError: (error: Error) => {
      toast.error(`Failed to position image: ${error.message}`);
    },
  });
};
