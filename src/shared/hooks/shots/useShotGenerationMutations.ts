/**
 * Shot-generation link operations: add, remove, reorder images within shots.
 * These operate on the shot_generations junction table.
 */

import { useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Shot, GenerationRow } from '@/types/shots';
import { toast } from '@/shared/components/ui/sonner';
import { invalidateGenerationsSync } from '@/shared/hooks/invalidation';
import { queryKeys } from '@/shared/lib/queryKeys';
import { SHOT_FILTER } from '@/shared/constants/filterConstants';
import { isNotFoundError } from '@/shared/constants/supabaseErrors';
import { VARIANT_TYPE } from '@/shared/constants/variantTypes';
import {
  calculateNextAvailableFrame,
  ensureUniqueFrame,
} from '@/shared/utils/timelinePositionCalculator';
import {
  cancelShotsQueries,
  findShotsCache,
  updateAllShotsCaches,
  rollbackShotsCaches,
  updateShotGenerationsCache,
  rollbackShotGenerationsCache,
  cancelShotGenerationsQuery,
} from './cacheUtils';

// ============================================================================
// HELPER: Check for quota/server errors
// ============================================================================

const isQuotaOrServerError = (error: Error): boolean => {
  const msg = error.message?.toLowerCase() || '';
  return (
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('quota') ||
    msg.includes('limit') ||
    msg.includes('capacity')
  );
};

// ============================================================================
// HELPER: Optimistically remove from unified-generations cache
// ============================================================================

function optimisticallyRemoveFromUnifiedGenerations(
  queryClient: QueryClient,
  projectId: string,
  generationId: string
): number {
  const unifiedGenQueries = queryClient.getQueriesData<{
    items: Array<{ id: string; generation_id?: string }>;
    total: number;
    hasMore?: boolean;
  }>({ queryKey: queryKeys.unified.projectPrefix(projectId) });

  let updatedCount = 0;

  unifiedGenQueries.forEach(([queryKey, data]) => {
    // Only remove from 'no-shot' filter views
    const filters = queryKey[5] as { shotId?: string } | undefined;
    if (filters?.shotId !== SHOT_FILTER.NO_SHOT) {
      return;
    }

    if (data?.items) {
      const filteredItems = data.items.filter(
        item => item.id !== generationId && item.generation_id !== generationId
      );

      if (filteredItems.length < data.items.length) {
        queryClient.setQueryData(queryKey, {
          ...data,
          items: filteredItems,
          total: Math.max(0, (data.total || 0) - 1),
        });
        updatedCount++;
      }
    }
  });

  return updatedCount;
}

// ============================================================================
// ADD IMAGE TO SHOT (unified hook)
// ============================================================================

interface AddImageToShotVariables {
  shot_id: string;
  generation_id: string;
  project_id: string;
  imageUrl?: string;
  thumbUrl?: string;
  /**
   * Timeline frame position:
   * - undefined: auto-calculate next available position
   * - null: add without position (unpositioned/gallery mode)
   * - number: use explicit frame position
   */
  timelineFrame?: number | null;
  skipOptimistic?: boolean;
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

  return useMutation({
    mutationFn: async (variables: AddImageToShotVariables) => {
      const { shot_id, generation_id, project_id, imageUrl, thumbUrl, timelineFrame } = variables;

      // UNPOSITIONED PATH: timelineFrame === null
      if (timelineFrame === null) {
        const { data, error } = await supabase
          .from('shot_generations')
          .insert({
            shot_id,
            generation_id,
            timeline_frame: null,
          })
          .select()
          .single();

        if (error) {
          throw error;
        }

        return { ...data, project_id, imageUrl, thumbUrl };
      }

      // AUTO-POSITION PATH: timelineFrame === undefined (use RPC for atomic operation)
      if (timelineFrame === undefined) {
        const { data: rpcResult, error: rpcError } = await supabase.rpc(
          'add_generation_to_shot',
          {
            p_shot_id: shot_id,
            p_generation_id: generation_id,
            p_with_position: true,
          }
        );

        if (rpcError) {
          throw rpcError;
        }

        const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;

        return { ...result, project_id, imageUrl, thumbUrl };
      }

      // EXPLICIT POSITION PATH: timelineFrame is a number

      // Fetch existing frames for collision detection
      const { data: existingGens, error: fetchError } = await supabase
        .from('shot_generations')
        .select('timeline_frame')
        .eq('shot_id', shot_id)
        .not('timeline_frame', 'is', null);

      if (fetchError && !isNotFoundError(fetchError)) {
        // Non-critical error - continue with empty frames
      }

      const existingFrames = (existingGens || [])
        .map(g => g.timeline_frame)
        .filter((f): f is number => f != null && f !== -1);

      const resolvedFrame = ensureUniqueFrame(timelineFrame, existingFrames);

      const { data, error } = await supabase
        .from('shot_generations')
        .insert({
          shot_id,
          generation_id,
          timeline_frame: resolvedFrame,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return { ...data, project_id, imageUrl, thumbUrl };
    },

    onMutate: async (variables) => {
      const {
        shot_id,
        generation_id,
        project_id,
        imageUrl,
        thumbUrl,
        timelineFrame,
        skipOptimistic,
      } = variables;

      if (!project_id) {
        return { previousShots: undefined, previousFastGens: undefined, project_id: undefined, shot_id: undefined };
      }

      await cancelShotsQueries(queryClient, project_id);
      await cancelShotGenerationsQuery(queryClient, shot_id);

      const previousShots = findShotsCache(queryClient, project_id);
      const previousFastGens = queryClient.getQueryData<GenerationRow[]>(
        queryKeys.generations.byShot(shot_id)
      );

      let tempId: string | undefined;

      // Only perform optimistic update if we have image URL and not skipped
      if ((imageUrl || thumbUrl) && !skipOptimistic) {
        tempId = `temp-${Date.now()}-${Math.random()}`;

        const createOptimisticItem = (currentImages: Array<{ timeline_frame?: number | null }>) => {
          const existingFrames = currentImages
            .filter(img => img.timeline_frame != null && img.timeline_frame !== -1)
            .map(img => img.timeline_frame as number);

          let resolvedFrame: number | null;
          if (timelineFrame === null) {
            resolvedFrame = null;
          } else if (timelineFrame !== undefined) {
            resolvedFrame = ensureUniqueFrame(timelineFrame, existingFrames);
          } else {
            resolvedFrame = calculateNextAvailableFrame(existingFrames);
          }

          return {
            id: tempId!,
            generation_id: generation_id,
            shotImageEntryId: tempId!,
            shot_generation_id: tempId!,
            location: imageUrl,
            thumbnail_url: thumbUrl || imageUrl,
            imageUrl: imageUrl,
            thumbUrl: thumbUrl || imageUrl,
            timeline_frame: resolvedFrame,
            type: 'image',
            created_at: new Date().toISOString(),
            starred: false,
            name: null,
            based_on: null,
            params: {},
            shot_data: resolvedFrame !== null ? { [shot_id]: [resolvedFrame] } : {},
            _optimistic: true,
          };
        };

        // Update shot-generations cache (Timeline)
        if (previousFastGens) {
          const optimisticItem = createOptimisticItem(previousFastGens);
          queryClient.setQueryData(
            queryKeys.generations.byShot(shot_id),
            [...previousFastGens, optimisticItem]
          );
        }

        // Update shots cache (Sidebar)
        updateAllShotsCaches(queryClient, project_id, (shots = []) =>
          shots.map(shot => {
            if (shot.id === shot_id) {
              const currentImages = shot.images || [];
              const optimisticItem = createOptimisticItem(currentImages);
              return { ...shot, images: [...currentImages, optimisticItem] };
            }
            return shot;
          })
        );
      }

      // Optimistically remove from unified-generations (for "items without shots" filter)
      optimisticallyRemoveFromUnifiedGenerations(
        queryClient,
        project_id,
        generation_id
      );

      return { previousShots, previousFastGens, project_id, shot_id, tempId };
    },

    onError: (error: Error, variables, context) => {
      // Check for duplicate key constraint
      const isDuplicateError =
        error.message?.includes('unique_shot_generation_pair') ||
        error.message?.includes('duplicate key value');

      if (isDuplicateError) {
        toast.error('Database error: unexpected constraint. Please try again.');
        return;
      }

      // Rollback caches
      if (context?.previousShots && context.project_id) {
        rollbackShotsCaches(queryClient, context.project_id, context.previousShots);
      }
      if (context?.previousFastGens && context.shot_id) {
        rollbackShotGenerationsCache(queryClient, context.shot_id, context.previousFastGens);
      }
      if (context?.project_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.unified.projectPrefix(context.project_id),
        });
      }

      // User-friendly error messages
      let userMessage = error.message;
      if (error.message.includes('Load failed') || error.message.includes('TypeError')) {
        userMessage = 'Network connection issue. Please check your internet connection and try again.';
      } else if (error.message.includes('fetch')) {
        userMessage = 'Unable to connect to server. Please try again in a moment.';
      } else if (isQuotaOrServerError(error)) {
        userMessage = 'Server is temporarily busy. Please wait a moment before trying again.';
      }

      toast.error(`Failed to add image to shot: ${userMessage}`);
    },

    onSuccess: (data, variables, context) => {
      const { project_id, shot_id, generation_id } = variables;

      // Replace temp ID with real ID in cache
      if (context?.tempId) {
        const updateCache = (oldData: GenerationRow[] | undefined) => {
          if (!oldData) return oldData;
          return oldData.map(item => {
            if (item.id === context.tempId) {
              return {
                ...item,
                id: data.id,
                generation_id: data.generation_id,
                shotImageEntryId: data.id,
                shot_generation_id: data.id,
                timeline_frame: data.timeline_frame,
                _optimistic: undefined,
              };
            }
            return item;
          });
        };

        queryClient.setQueryData(queryKeys.generations.byShot(shot_id), updateCache);

        // Also update shots cache
        updateAllShotsCaches(queryClient, project_id, (shots = []) =>
          shots.map(shot => {
            if (shot.id === shot_id && shot.images) {
              return {
                ...shot,
                images: shot.images.map(img => {
                  if (img.id === context.tempId) {
                    return {
                      ...img,
                      id: data.id,
                      generation_id: data.generation_id,
                      shotImageEntryId: data.id,
                      shot_generation_id: data.id,
                      timeline_frame: data.timeline_frame,
                      _optimistic: undefined,
                    };
                  }
                  return img;
                }),
              };
            }
            return shot;
          })
        );
      }

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.shots.list(project_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.generations.meta(shot_id) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.unified.projectPrefix(project_id),
      });
      // Invalidate byShot to ensure timeline refetches with complete data.
      // Critical when the target shot's cache wasn't populated at mutation time
      // (e.g., adding to a different shot than the one currently viewed),
      // since no optimistic item would have been created in that case.
      queryClient.invalidateQueries({ queryKey: queryKeys.generations.byShot(shot_id) });
    },
  });
};

/**
 * Add image to shot WITHOUT position.
 * Backwards-compatible wrapper around useAddImageToShot.
 *
 * Note: This intentionally skips optimistic item creation in the shots cache
 * (matching original behavior). The item will appear after realtime confirms.
 * Only the unified-generations cache is updated optimistically (for instant
 * removal from "items without shots" filter).
 */
export const useAddImageToShotWithoutPosition = () => {
  const addMutation = useAddImageToShot();

  return {
    ...addMutation,
    mutateAsync: (vars: Omit<AddImageToShotVariables, 'timelineFrame' | 'skipOptimistic'>) =>
      addMutation.mutateAsync({ ...vars, timelineFrame: null, skipOptimistic: true }),
    mutate: (vars: Omit<AddImageToShotVariables, 'timelineFrame' | 'skipOptimistic'>) =>
      addMutation.mutate({ ...vars, timelineFrame: null, skipOptimistic: true }),
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

      const { error } = await supabase
        .from('shot_generations')
        .update({ timeline_frame: null })
        .eq('id', shotGenerationId);

      if (error) {
        throw error;
      }

      // Persist frame shifts (optimistic update already applied in onMutate)
      if (shiftItems && shiftItems.length > 0) {
        const { error: rpcError } = await supabase.rpc('batch_update_timeline_frames', {
          p_updates: shiftItems.map(u => ({
            shot_generation_id: u.id,
            timeline_frame: u.newFrame,
            metadata: { user_positioned: true }
          }))
        });
        if (rpcError) {
          throw rpcError;
        }
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
                images: shot.images.map(img => {
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

    onError: (err: Error, variables, context) => {
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
        supabase
          .from('shot_generations')
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

    onError: (err: Error, variables, context) => {
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
      const { data, error } = await supabase.rpc('add_generation_to_shot', {
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
      invalidateGenerationsSync(queryClient, data.shot_id, {
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

// ============================================================================
// DUPLICATE AS NEW GENERATION
// ============================================================================

/**
 * Duplicate an image in a shot by creating a NEW generation from the primary variant.
 */
export const useDuplicateAsNewGeneration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      shot_id,
      generation_id,
      project_id,
      timeline_frame,
      next_timeline_frame,
      target_timeline_frame,
    }: {
      shot_id: string;
      generation_id: string;
      project_id: string;
      timeline_frame: number;
      next_timeline_frame?: number;
      /** Explicit target frame - bypasses midpoint/+30 calculation */
      target_timeline_frame?: number;
    }) => {
      // 1. Get the primary variant for the source generation
      const { data: primaryVariant, error: variantError } = await supabase
        .from('generation_variants')
        .select('*')
        .eq('generation_id', generation_id)
        .eq('is_primary', true)
        .maybeSingle();

      if (variantError) {
        throw new Error(`Failed to fetch primary variant: ${variantError.message}`);
      }

      let sourceLocation: string;
      let sourceThumbnail: string | null;
      let sourceParams: Record<string, unknown> = {};

      if (primaryVariant) {
        sourceLocation = primaryVariant.location;
        sourceThumbnail = primaryVariant.thumbnail_url;
        sourceParams = (primaryVariant.params as Record<string, unknown>) || {};
      } else {
        // Fallback to generation
        const { data: generation, error: genError } = await supabase
          .from('generations')
          .select('location, thumbnail_url, params, type')
          .eq('id', generation_id)
          .single();

        if (genError || !generation) {
          throw new Error(`Failed to fetch generation: ${genError?.message || 'Not found'}`);
        }

        sourceLocation = generation.location;
        sourceThumbnail = generation.thumbnail_url;
        sourceParams = (generation.params as Record<string, unknown>) || {};
      }

      // 2. Determine media type
      const isVideo = sourceLocation?.match(/\.(mp4|webm|mov)$/i);
      const mediaType = isVideo ? 'video' : 'image';

      // 3. Create new generation
      const newGenerationData = {
        location: sourceLocation,
        thumbnail_url: sourceThumbnail,
        project_id: project_id,
        type: mediaType,
        based_on: generation_id,
        params: {
          ...sourceParams,
          source: 'timeline_duplicate',
          source_generation_id: generation_id,
          duplicated_at: new Date().toISOString(),
        },
      };

      const { data: newGeneration, error: insertError } = await supabase
        .from('generations')
        .insert(newGenerationData)
        .select()
        .single();

      if (insertError || !newGeneration) {
        throw new Error(`Failed to create generation: ${insertError?.message || 'Unknown error'}`);
      }

      // 4. Create variant
      await supabase.from('generation_variants').insert({
        generation_id: newGeneration.id,
        location: sourceLocation,
        thumbnail_url: sourceThumbnail,
        is_primary: true,
        variant_type: VARIANT_TYPE.ORIGINAL,
        name: 'Original',
        params: newGenerationData.params,
      });

      // 5. Calculate timeline position
      const { data: existingFramesData } = await supabase
        .from('shot_generations')
        .select('timeline_frame')
        .eq('shot_id', shot_id);

      const existingFrames = (existingFramesData || [])
        .map(shotGen => shotGen.timeline_frame)
        .filter((f): f is number => f !== null);

      let targetTimelineFrame: number;
      if (target_timeline_frame !== undefined) {
        // Explicit target provided (interceptor pre-calculates midpoint + collision avoidance)
        targetTimelineFrame = target_timeline_frame;
      } else if (next_timeline_frame !== undefined) {
        targetTimelineFrame = Math.floor((timeline_frame + next_timeline_frame) / 2);
      } else {
        targetTimelineFrame = timeline_frame + 30;
      }

      let newTimelineFrame = Math.max(0, Math.round(targetTimelineFrame));
      if (existingFrames.includes(newTimelineFrame)) {
        let offset = 1;
        while (offset < 1000) {
          const higher = newTimelineFrame + offset;
          if (!existingFrames.includes(higher)) {
            newTimelineFrame = higher;
            break;
          }
          const lower = newTimelineFrame - offset;
          if (lower >= 0 && !existingFrames.includes(lower)) {
            newTimelineFrame = lower;
            break;
          }
          offset += 1;
        }
      }

      // 6. Add to shot
      const { data: newShotGen, error: addError } = await supabase
        .from('shot_generations')
        .insert({
          shot_id,
          generation_id: newGeneration.id,
          timeline_frame: newTimelineFrame,
        })
        .select()
        .single();

      if (addError || !newShotGen) {
        throw new Error(`Failed to add to shot: ${addError?.message || 'Unknown error'}`);
      }

      return {
        shot_id,
        original_generation_id: generation_id,
        new_generation_id: newGeneration.id,
        new_shot_generation_id: newShotGen.id,
        timeline_frame: newTimelineFrame,
        project_id,
      };
    },

    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shots.list(data.project_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.generations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.generations.byProjectAll });
      invalidateGenerationsSync(queryClient, data.shot_id, {
        reason: 'duplicate-as-new-generation',
        scope: 'all',
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.generations.derivedGenerations(data.original_generation_id),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.segments.liveTimeline(data.shot_id) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.segments.parents(data.shot_id, data.project_id),
      });
    },

    onError: (error: Error) => {
      toast.error(`Failed to duplicate image: ${error.message}`);
    },
  });
};
