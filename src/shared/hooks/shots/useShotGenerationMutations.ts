/**
 * Shot-generation link operations: add, remove, reorder images within shots.
 * These operate on the shot_generations junction table.
 */

import { useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Shot, GenerationRow } from '@/types/shots';
import { toast } from 'sonner';
import { invalidateGenerationsSync } from '@/shared/hooks/useGenerationInvalidation';
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
import { shotDebug, shotError } from './debug';

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
    items: any[];
    total: number;
    hasMore?: boolean;
  }>({ queryKey: ['unified-generations', 'project', projectId] });

  let updatedCount = 0;

  unifiedGenQueries.forEach(([queryKey, data]) => {
    // Only remove from 'no-shot' filter views
    const filters = queryKey[5] as { shotId?: string } | undefined;
    if (filters?.shotId !== 'no-shot') {
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

      shotDebug('add', 'mutationFn START', {
        shotId: shot_id,
        generationId: generation_id,
        timelineFrame: timelineFrame === undefined ? 'auto' : timelineFrame === null ? 'none' : timelineFrame,
      });

      // UNPOSITIONED PATH: timelineFrame === null
      if (timelineFrame === null) {
        shotDebug('add', 'Using unpositioned path (timeline_frame = null)');

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
          shotError('add', 'Insert failed (unpositioned)', error, { shotId: shot_id });
          throw error;
        }

        shotDebug('add', 'Insert succeeded (unpositioned)', { id: data.id });
        return { ...data, project_id, imageUrl, thumbUrl };
      }

      // AUTO-POSITION PATH: timelineFrame === undefined (use RPC for atomic operation)
      if (timelineFrame === undefined) {
        shotDebug('add', 'Using fast RPC path (add_generation_to_shot)');

        const { data: rpcResult, error: rpcError } = await supabase.rpc(
          'add_generation_to_shot',
          {
            p_shot_id: shot_id,
            p_generation_id: generation_id,
            p_with_position: true,
          }
        );

        if (rpcError) {
          shotError('add', 'RPC failed', rpcError, { shotId: shot_id });
          throw rpcError;
        }

        const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;

        shotDebug('add', 'RPC succeeded', {
          id: result?.id,
          timeline_frame: result?.timeline_frame,
        });

        return { ...result, project_id, imageUrl, thumbUrl };
      }

      // EXPLICIT POSITION PATH: timelineFrame is a number
      shotDebug('add', 'Using explicit frame path', { timelineFrame });

      // Fetch existing frames for collision detection
      const { data: existingGens, error: fetchError } = await supabase
        .from('shot_generations')
        .select('timeline_frame')
        .eq('shot_id', shot_id)
        .not('timeline_frame', 'is', null);

      if (fetchError && fetchError.code !== 'PGRST116') {
        shotError('add', 'Error fetching existing frames', fetchError, { shotId: shot_id });
      }

      const existingFrames = (existingGens || [])
        .map(g => g.timeline_frame)
        .filter((f): f is number => f != null && f !== -1);

      const resolvedFrame = ensureUniqueFrame(timelineFrame, existingFrames);
      if (resolvedFrame !== timelineFrame) {
        shotDebug('add', 'Adjusted frame for collision', {
          original: timelineFrame,
          resolved: resolvedFrame,
        });
      }

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
        shotError('add', 'Insert failed', error, { shotId: shot_id });
        throw error;
      }

      shotDebug('add', 'Insert succeeded', {
        id: data?.id,
        timeline_frame: data?.timeline_frame,
      });

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

      shotDebug('add', 'onMutate START', {
        shotId: shot_id,
        generationId: generation_id,
        hasImageUrl: !!imageUrl,
        timelineFrame: timelineFrame === undefined ? 'auto' : timelineFrame === null ? 'none' : timelineFrame,
        skipOptimistic,
      });

      if (!project_id) {
        return { previousShots: undefined, previousFastGens: undefined, project_id: undefined, shot_id: undefined };
      }

      await cancelShotsQueries(queryClient, project_id);
      await cancelShotGenerationsQuery(queryClient, shot_id);

      const previousShots = findShotsCache(queryClient, project_id);
      const previousFastGens = queryClient.getQueryData<GenerationRow[]>([
        'all-shot-generations',
        shot_id,
      ]);

      let tempId: string | undefined;

      // Only perform optimistic update if we have image URL and not skipped
      if ((imageUrl || thumbUrl) && !skipOptimistic) {
        tempId = `temp-${Date.now()}-${Math.random()}`;

        const createOptimisticItem = (currentImages: any[]) => {
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
            ['all-shot-generations', shot_id],
            [...previousFastGens, optimisticItem]
          );
          shotDebug('add', 'Set optimistic cache', {
            shotId: shot_id,
            previousCount: previousFastGens.length,
            newCount: previousFastGens.length + 1,
          });
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
      const updatedCacheCount = optimisticallyRemoveFromUnifiedGenerations(
        queryClient,
        project_id,
        generation_id
      );

      if (updatedCacheCount > 0) {
        shotDebug('add', 'Removed from unified-generations', {
          generationId: generation_id,
          cacheEntriesUpdated: updatedCacheCount,
        });
      }

      return { previousShots, previousFastGens, project_id, shot_id, tempId };
    },

    onError: (error: Error, variables, context) => {
      shotError('add', 'onError - rolling back', error, {
        shotId: variables.shot_id,
        generationId: variables.generation_id,
      });

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
          queryKey: ['unified-generations', 'project', context.project_id],
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

      shotDebug('add', 'onSuccess', {
        shotId: shot_id,
        generationId: generation_id,
        newId: data?.id,
        tempId: context?.tempId,
        timeline_frame: data?.timeline_frame,
      });

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

        queryClient.setQueryData(['all-shot-generations', shot_id], updateCache);

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
      queryClient.invalidateQueries({ queryKey: ['shots', project_id] });
      queryClient.invalidateQueries({ queryKey: ['shot-generations-meta', shot_id] });
      queryClient.invalidateQueries({
        queryKey: ['unified-generations', 'project', project_id],
      });
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
    }: {
      shotId: string;
      shotGenerationId: string;
      projectId: string;
    }) => {
      shotDebug('remove', 'mutationFn START', { shotId, shotGenerationId, projectId });

      if (!shotId || !shotGenerationId || !projectId) {
        throw new Error(`Missing required parameters`);
      }

      const { error } = await supabase
        .from('shot_generations')
        .update({ timeline_frame: null })
        .eq('id', shotGenerationId);

      if (error) {
        shotError('remove', 'Database update failed', error, { shotId, shotGenerationId });
        throw error;
      }

      shotDebug('remove', 'Database update successful', { shotId, shotGenerationId });
      return { shotId, shotGenerationId, projectId };
    },

    onMutate: async (variables) => {
      const { shotId, shotGenerationId, projectId } = variables;
      shotDebug('remove', 'onMutate START', { shotId, shotGenerationId, projectId });

      await cancelShotsQueries(queryClient, projectId);
      await cancelShotGenerationsQuery(queryClient, shotId);

      const previousShots = findShotsCache(queryClient, projectId);
      const previousFastGens = queryClient.getQueryData<GenerationRow[]>([
        'all-shot-generations',
        shotId,
      ]);

      // Optimistically set timeline_frame = null
      if (previousFastGens) {
        queryClient.setQueryData(
          ['all-shot-generations', shotId],
          previousFastGens.map(g =>
            g.id === shotGenerationId ? { ...g, timeline_frame: null } : g
          )
        );
      }

      if (previousShots) {
        updateAllShotsCaches(queryClient, projectId, (shots = []) =>
          shots.map(shot => {
            if (shot.id === shotId) {
              return {
                ...shot,
                images: shot.images.map(img =>
                  img.id === shotGenerationId ? { ...img, timeline_frame: null } : img
                ),
              };
            }
            return shot;
          })
        );
      }

      return { previousShots, previousFastGens, projectId, shotId };
    },

    onError: (err: Error, variables, context) => {
      shotError('remove', 'onError - rolling back', err, {
        shotId: variables.shotId,
        shotGenerationId: variables.shotGenerationId,
      });

      if (context?.previousShots && context.projectId) {
        rollbackShotsCaches(queryClient, context.projectId, context.previousShots);
      }
      if (context?.previousFastGens && context.shotId) {
        rollbackShotGenerationsCache(queryClient, context.shotId, context.previousFastGens);
      }

      toast.error(`Failed to remove image from timeline: ${err.message}`);
    },

    onSuccess: (data) => {
      shotDebug('remove', 'onSuccess', { shotId: data.shotId, shotGenerationId: data.shotGenerationId });

      // Invalidate segment queries
      queryClient.invalidateQueries({ queryKey: ['segment-live-timeline', data.shotId] });
      queryClient.invalidateQueries({
        queryKey: ['segment-parent-generations', data.shotId, data.projectId],
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
      shotDebug('reorder', 'mutationFn START', { shotId, updatesCount: updates.length });

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

      shotDebug('reorder', 'DB updates successful', { shotId, successCount: results.length });
      return { projectId, shotId, updates };
    },

    onMutate: async (variables) => {
      const { updates, shotId } = variables;

      await cancelShotGenerationsQuery(queryClient, shotId);

      const previousFastGens = queryClient.getQueryData<GenerationRow[]>([
        'all-shot-generations',
        shotId,
      ]);

      if (previousFastGens) {
        const updatedGens = previousFastGens.map(gen => {
          const update = updates.find(u => u.generation_id === gen.generation_id);
          if (update) {
            return { ...gen, timeline_frame: update.timeline_frame };
          }
          return gen;
        });

        updatedGens.sort((a, b) => (a.timeline_frame || 0) - (b.timeline_frame || 0));
        queryClient.setQueryData(['all-shot-generations', shotId], updatedGens);
      }

      return { previousFastGens, shotId };
    },

    onError: (err: Error, variables, context) => {
      shotError('reorder', 'onError', err, { shotId: variables.shotId });

      if (context?.previousFastGens && context.shotId) {
        rollbackShotGenerationsCache(queryClient, context.shotId, context.previousFastGens);
      }

      toast.error('Failed to reorder images');
    },

    onSuccess: (data) => {
      shotDebug('reorder', 'onSuccess', { shotId: data.shotId });

      queryClient.invalidateQueries({ queryKey: ['shot-generations-meta', data.shotId] });
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
      shotDebug('position', 'mutationFn START', { shotId: shot_id, generationId: generation_id });

      const { data, error } = await supabase.rpc('add_generation_to_shot', {
        p_shot_id: shot_id,
        p_generation_id: generation_id,
        p_with_position: true,
      });

      if (error) {
        shotError('position', 'RPC Error', error, { shotId: shot_id });
        throw error;
      }

      shotDebug('position', 'RPC Success', { data });
      return { shot_id, generation_id, project_id, data };
    },

    onSuccess: (data) => {
      shotDebug('position', 'onSuccess', { shotId: data.shot_id });

      invalidateGenerationsSync(queryClient, data.shot_id, {
        reason: 'add-image-to-shot',
        scope: 'all',
        includeShots: true,
        projectId: data.project_id,
        includeProjectUnified: true,
      });
    },

    onError: (error: Error) => {
      shotError('position', 'Mutation failed', error);
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
    }: {
      shot_id: string;
      generation_id: string;
      project_id: string;
      timeline_frame: number;
      next_timeline_frame?: number;
    }) => {
      shotDebug('duplicate', 'Starting duplication', {
        shotId: shot_id,
        generationId: generation_id,
        timeline_frame,
      });

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
      let sourceParams: Record<string, any> = {};

      if (primaryVariant) {
        sourceLocation = primaryVariant.location;
        sourceThumbnail = primaryVariant.thumbnail_url;
        sourceParams = (primaryVariant.params as Record<string, any>) || {};
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
        sourceParams = (generation.params as Record<string, any>) || {};
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
        variant_type: 'original',
        name: 'Original',
        params: newGenerationData.params,
      });

      // 5. Calculate timeline position
      const { data: existingFramesData } = await supabase
        .from('shot_generations')
        .select('timeline_frame')
        .eq('shot_id', shot_id);

      const existingFrames = (existingFramesData || [])
        .map(sg => sg.timeline_frame)
        .filter((f): f is number => f !== null);

      let targetTimelineFrame: number;
      if (next_timeline_frame !== undefined) {
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

      shotDebug('duplicate', 'Duplication complete', {
        newGenerationId: newGeneration.id,
        newShotGenId: newShotGen.id,
        timeline_frame: newTimelineFrame,
      });

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
      queryClient.invalidateQueries({ queryKey: ['shots', data.project_id] });
      queryClient.invalidateQueries({ queryKey: ['generations'] });
      queryClient.invalidateQueries({ queryKey: ['project-generations'] });
      invalidateGenerationsSync(queryClient, data.shot_id, {
        reason: 'duplicate-as-new-generation',
        scope: 'all',
      });
      queryClient.invalidateQueries({
        queryKey: ['derived-generations', data.original_generation_id],
      });
      queryClient.invalidateQueries({ queryKey: ['segment-live-timeline', data.shot_id] });
      queryClient.invalidateQueries({
        queryKey: ['segment-parent-generations', data.shot_id, data.project_id],
      });
    },

    onError: (error: Error) => {
      shotError('duplicate', 'Error', error);
      toast.error(`Failed to duplicate image: ${error.message}`);
    },
  });
};
