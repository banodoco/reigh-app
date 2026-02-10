/**
 * Generation Mutations
 * ====================
 *
 * Mutation hooks for creating, updating, deleting, and starring generations.
 * Extracted from useProjectGenerations.ts to separate query and mutation concerns.
 *
 * ## Exports
 * - `useDeleteGeneration` — Delete a generation
 * - `useDeleteVariant` — Delete a variant from generation_variants
 * - `useUpdateGenerationLocation` — Update a generation's location/thumbnail
 * - `useCreateGeneration` — Create a new generation (external upload)
 * - `useToggleGenerationStar` — Star/unstar with optimistic updates
 *
 * @module useGenerationMutations
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { handleError } from '@/shared/lib/errorHandler';
import { queryKeys } from '@/shared/lib/queryKeys';
import { VARIANT_TYPE } from '@/shared/constants/variantTypes';
import type { GenerationRow } from '@/types/shots';
import type { GenerationsPaginatedResponse } from './useProjectGenerations';

// ===== Helper Functions (internal) =====

/**
 * Update generation location using direct Supabase call.
 * @internal Used by useUpdateGenerationLocation hook.
 */
async function updateGenerationLocation(id: string, location: string, thumbUrl?: string): Promise<void> {
  const updateData: { location: string; thumbnail_url?: string } = { location };

  // If thumbUrl is provided, update it as well (important for flipped images)
  if (thumbUrl) {
    updateData.thumbnail_url = thumbUrl;
  }

  const { error } = await supabase
    .from('generations')
    .update(updateData)
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to update generation: ${error.message}`);
  }
}

/**
 * Create a new generation using direct Supabase call.
 * @internal Used by useCreateGeneration hook.
 */
async function createGeneration(params: {
  imageUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  projectId: string;
  prompt: string;
  thumbnailUrl?: string;
  /** Resolution in "WIDTHxHEIGHT" format (e.g., "1920x1080") */
  resolution?: string;
  /** Standard aspect ratio (e.g., "16:9") */
  aspectRatio?: string;
}): Promise<Record<string, unknown>> {
  const generationParams: Record<string, unknown> = {
    prompt: params.prompt,
    source: 'external_upload',
    original_filename: params.fileName,
    file_type: params.fileType,
    file_size: params.fileSize,
  };

  // Add dimension params if provided
  if (params.resolution) {
    generationParams.resolution = params.resolution;
  }
  if (params.aspectRatio) {
    generationParams.aspect_ratio = params.aspectRatio;
  }

  const { data, error } = await supabase
    .from('generations')
    .insert({
      location: params.imageUrl,
      thumbnail_url: params.thumbnailUrl || params.imageUrl, // Use thumbnail URL if provided, fallback to main image
      type: params.fileType || 'image',
      project_id: params.projectId,
      params: generationParams,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create generation: ${error?.message || 'Unknown error'}`);
  }

  // Create the original variant for this generation
  const { error: variantError } = await supabase
    .from('generation_variants')
    .insert({
      generation_id: data.id,
      location: params.imageUrl,
      thumbnail_url: params.thumbnailUrl || params.imageUrl,
      is_primary: true,
      variant_type: VARIANT_TYPE.ORIGINAL,
      name: 'Original',
      params: generationParams,
    });

  if (variantError) {
    console.error('[useGenerationMutations] Failed to create variant:', variantError);
  }

  return data;
}

/**
 * Star/unstar a generation using direct Supabase call.
 * @internal Used by useToggleGenerationStar hook.
 */
async function toggleGenerationStar(id: string, starred: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('generations')
    .update({ starred })
    .eq('id', id)
    .select('id, starred');

  if (error) {
    throw new Error(`Failed to ${starred ? 'star' : 'unstar'} generation: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error(`Failed to update generation: No rows updated (possible RLS policy issue)`);
  }
}

// ===== Mutation Hooks =====

export function useDeleteGeneration() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('generations')
        .delete()
        .eq('id', id);

      if (error) {
        throw new Error(`Failed to delete generation: ${error.message}`);
      }
    },
    onError: (error: Error) => {
      handleError(error, { context: 'useDeleteGeneration', toastTitle: 'Failed to delete generation' });
    },
  });
}

/**
 * Delete a variant from generation_variants table.
 * Use this for edit tools (edit-images, edit-video, character-animate) that create variants.
 */
export function useDeleteVariant() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('generation_variants')
        .delete()
        .eq('id', id);

      if (error) {
        throw new Error(`Failed to delete variant: ${error.message}`);
      }
    },
    onError: (error: Error) => {
      handleError(error, { context: 'useDeleteVariant', toastTitle: 'Failed to delete variant' });
    },
  });
}

export function useUpdateGenerationLocation() {
  return useMutation({
    mutationFn: ({ id, location, thumbUrl, projectId }: { id: string; location: string; thumbUrl?: string; projectId?: string }) => {
      return updateGenerationLocation(id, location, thumbUrl);
    },
    onError: (error: Error) => {
      handleError(error, { context: 'useUpdateGenerationLocation', toastTitle: 'Failed to update generation' });
    },
  });
}

export function useCreateGeneration() {
  return useMutation({
    mutationFn: createGeneration,
    onError: (error: Error) => {
      handleError(error, { context: 'useCreateGeneration', toastTitle: 'Failed to create generation' });
    },
  });
}

export function useToggleGenerationStar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean; shotId?: string }) => {
      return toggleGenerationStar(id, starred);
    },
    onMutate: async ({ id, starred, shotId }) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.unified.all }),
        queryClient.cancelQueries({ queryKey: queryKeys.shots.all }),
        queryClient.cancelQueries({ queryKey: queryKeys.generations.byShotAll }),
      ]);

      // Snapshot previous values for rollback
      const previousGenerationsQueries = new Map();
      const previousShotsQueries = new Map();
      const previousAllShotGenerationsQueries = new Map();

      // 1) Optimistically update all generations-list caches
      const generationsQueries = queryClient.getQueriesData({ queryKey: queryKeys.unified.all });
      generationsQueries.forEach(([queryKey, data]) => {
        if (data && typeof data === 'object' && 'items' in data) {
          previousGenerationsQueries.set(queryKey, data);
          const updated = {
            ...data,
            items: (data as GenerationsPaginatedResponse).items.map((g) => (g.id === id ? { ...g, starred } : g)),
          };
          queryClient.setQueryData(queryKey, updated);
        }
      });

      // 2) Optimistically update all shots caches so star reflects in Shot views / timelines
      const shotsQueries = queryClient.getQueriesData({ queryKey: queryKeys.shots.all });
      shotsQueries.forEach(([queryKey, data]) => {
        if (Array.isArray(data)) {
          previousShotsQueries.set(queryKey, data);
          const updatedShots = (data as Array<Record<string, unknown>>).map((shot) => {
            if (!shot.images) return shot;
            return {
              ...shot,
              images: (shot.images as Array<Record<string, unknown>>).map((img) => (img.id === id ? { ...img, starred } : img)),
            };
          });
          queryClient.setQueryData(queryKey, updatedShots);
        }
      });

      // 3) Optimistically update the EXACT all-shot-generations cache for this shot (used by Timeline/ShotEditor)
      if (shotId) {
        const queryKey = queryKeys.generations.byShot(shotId);
        const previousData = queryClient.getQueryData(queryKey);
        if (previousData && Array.isArray(previousData)) {
          previousAllShotGenerationsQueries.set(queryKey, previousData);
          const updatedGenerations = (previousData as GenerationRow[]).map((gen) =>
            gen.id === id ? { ...gen, starred } : gen
          );
          queryClient.setQueryData(queryKey, updatedGenerations);
        }
      }

      return { previousGenerationsQueries, previousShotsQueries, previousAllShotGenerationsQueries };
    },
    onError: (error: Error, _variables, context) => {
      // Rollback optimistic updates
      if (context?.previousGenerationsQueries) {
        context.previousGenerationsQueries.forEach((data, key) => {
          queryClient.setQueryData(key, data);
        });
      }
      if (context?.previousShotsQueries) {
        context.previousShotsQueries.forEach((data, key) => {
          queryClient.setQueryData(key, data);
        });
      }
      if (context?.previousAllShotGenerationsQueries) {
        context.previousAllShotGenerationsQueries.forEach((data, key) => {
          queryClient.setQueryData(key, data);
        });
      }
      handleError(error, { context: 'useToggleGenerationStar', toastTitle: 'Failed to toggle star' });
    },
    onSuccess: (_data, variables) => {
      // Emit custom event so Timeline knows to refetch star data
      if (variables.shotId) {
        window.dispatchEvent(new CustomEvent('generation-star-updated', {
          detail: { generationId: variables.id, shotId: variables.shotId, starred: variables.starred }
        }));
      }
    },
  });
}
