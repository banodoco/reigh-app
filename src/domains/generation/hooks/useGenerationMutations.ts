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
import type { Json } from '@/integrations/supabase/types';
import {
  createGenerationPrimaryVariant,
  createGenerationRecord,
  deleteGenerationByScope,
  deleteGenerationVariantByScope,
  updateGenerationLocationByScope,
  updateGenerationStarByScope,
} from '@/integrations/supabase/repositories/generationMutationsRepository';
import {
  normalizeAndPresentAndRethrow,
  normalizeAndPresentError,
} from '@/shared/lib/errorHandling/runtimeError';
import { queryKeys } from '@/shared/lib/queryKeys';
import { dispatchAppEvent } from '@/shared/lib/typedEvents';
import { VARIANT_TYPE } from '@/shared/constants/variantTypes';
import {
  resolveGenerationProjectScope,
  resolveVariantProjectScope,
} from '@/shared/lib/generationTaskRepository';
import type { GenerationRow } from '@/types/shots';
import type { Shot } from '@/types/shots';

// ===== Helper Functions (internal) =====

interface ScopedGenerationInput {
  id: string;
  projectId: string;
}

interface ScopedVariantInput {
  id: string;
  projectId: string;
}

function ensureProjectScope(projectId: string | undefined, context: string): string {
  if (projectId && projectId.trim().length > 0) {
    return projectId;
  }
  normalizeAndPresentAndRethrow(new Error('Mutation requires project scope'), {
    context,
    showToast: false,
    logData: { reason: 'missing_project_scope' },
  });
}

async function verifyGenerationScope(generationId: string, projectId: string, context: string): Promise<void> {
  const scope = await resolveGenerationProjectScope(generationId, projectId);
  if (scope.status === 'ok') {
    return;
  }

  normalizeAndPresentAndRethrow(
    new Error(`Generation scope validation failed (${scope.status})`),
    {
      context,
      showToast: false,
      logData: {
        generationId,
        projectId,
        scopeStatus: scope.status,
        queryError: scope.queryError,
      },
    },
  );
}

async function verifyVariantScope(
  variantId: string,
  projectId: string,
  context: string,
): Promise<{ generationId: string }> {
  const scope = await resolveVariantProjectScope(variantId, projectId);
  if (scope.status === 'ok' && scope.generationId) {
    return { generationId: scope.generationId };
  }

  normalizeAndPresentAndRethrow(
    new Error(`Variant scope validation failed (${scope.status})`),
    {
      context,
      showToast: false,
      logData: {
        variantId,
        projectId,
        generationId: scope.generationId,
        scopeStatus: scope.status,
        queryError: scope.queryError,
      },
    },
  );
}

/**
 * Update generation location using direct Supabase call.
 * @internal Used by useUpdateGenerationLocation hook.
 */
async function updateGenerationLocation(
  params: ScopedGenerationInput & { location: string; thumbUrl?: string },
): Promise<void> {
  const projectId = ensureProjectScope(
    params.projectId,
    'useGenerationMutations.updateGenerationLocation.projectScope',
  );
  await verifyGenerationScope(
    params.id,
    projectId,
    'useGenerationMutations.updateGenerationLocation.scopeValidation',
  );

  const updateData: { location: string; thumbnail_url?: string } = { location: params.location };

  // If thumbUrl is provided, update it as well (important for flipped images)
  if (params.thumbUrl) {
    updateData.thumbnail_url = params.thumbUrl;
  }

  const { data, error } = await updateGenerationLocationByScope({
    id: params.id,
    projectId,
    location: updateData.location,
    thumbnailUrl: updateData.thumbnail_url,
  });

  if (error) {
    normalizeAndPresentAndRethrow(error, {
      context: 'useGenerationMutations.updateGenerationLocation',
      showToast: false,
      logData: { generationId: params.id, projectId },
    });
  }

  if (!data || data.length === 0) {
    normalizeAndPresentAndRethrow(new Error('No rows updated while enforcing generation project scope'), {
      context: 'useGenerationMutations.updateGenerationLocation.noRows',
      showToast: false,
      logData: { generationId: params.id, projectId },
    });
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
}): Promise<GenerationRow> {
  const generationParams: Record<string, Json | undefined> = {
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

  const { data, error } = await createGenerationRecord({
    imageUrl: params.imageUrl,
    thumbnailUrl: params.thumbnailUrl || params.imageUrl,
    fileType: params.fileType || 'image',
    projectId: params.projectId,
    generationParams,
  });

  if (error || !data) {
    normalizeAndPresentAndRethrow(error ?? new Error('Failed to create generation'), {
      context: 'useCreateGeneration.createGeneration',
      showToast: false,
      logData: { projectId: params.projectId },
    });
  }

  // Create the original variant for this generation
  const { error: variantError } = await createGenerationPrimaryVariant({
    generationId: data.id,
    imageUrl: params.imageUrl,
    thumbnailUrl: params.thumbnailUrl || params.imageUrl,
    generationParams,
    variantType: VARIANT_TYPE.ORIGINAL,
  });

  if (variantError) {
    normalizeAndPresentAndRethrow(variantError, {
      context: 'useCreateGeneration.createVariant',
      showToast: false,
    });
  }

  return data;
}

/**
 * Star/unstar a generation using direct Supabase call.
 * @internal Used by useToggleGenerationStar hook.
 */
async function toggleGenerationStar(params: ScopedGenerationInput & { starred: boolean }): Promise<void> {
  const projectId = ensureProjectScope(
    params.projectId,
    'useGenerationMutations.toggleGenerationStar.projectScope',
  );
  await verifyGenerationScope(
    params.id,
    projectId,
    'useGenerationMutations.toggleGenerationStar.scopeValidation',
  );

  const { data, error } = await updateGenerationStarByScope({
    id: params.id,
    projectId,
    starred: params.starred,
  });

  if (error) {
    normalizeAndPresentAndRethrow(error, {
      context: 'useGenerationMutations.toggleGenerationStar',
      showToast: false,
      logData: { generationId: params.id, projectId, starred: params.starred },
    });
  }

  if (!data || data.length === 0) {
    normalizeAndPresentAndRethrow(
      new Error('No rows updated while toggling generation star (possible RLS policy issue)'),
      {
        context: 'useGenerationMutations.toggleGenerationStar.noRows',
        showToast: false,
        logData: { generationId: params.id, projectId, starred: params.starred },
      },
    );
  }
}

// ===== Mutation Hooks =====

/**
 * Shared delete mutation factory for generations and variants.
 * @internal
 */
function useDeleteFromTable(table: 'generations' | 'generation_variants', entityLabel: string) {
  return useMutation({
    mutationFn: async (input: ScopedGenerationInput | ScopedVariantInput) => {
      const projectId = ensureProjectScope(
        input.projectId,
        `useGenerationMutations.useDeleteFromTable.${table}.projectScope`,
      );

      if (table === 'generations') {
        await verifyGenerationScope(
          input.id,
          projectId,
          `useGenerationMutations.useDeleteFromTable.${table}.scopeValidation`,
        );

        const { data, error } = await deleteGenerationByScope({
          id: input.id,
          projectId,
        });

        if (error) {
          normalizeAndPresentAndRethrow(error, {
            context: `useGenerationMutations.useDeleteFromTable.${table}`,
            showToast: false,
            logData: { id: input.id, projectId, entityLabel },
          });
        }

        if (!data || data.length === 0) {
          normalizeAndPresentAndRethrow(new Error('No rows deleted while enforcing generation scope'), {
            context: `useGenerationMutations.useDeleteFromTable.${table}.noRows`,
            showToast: false,
            logData: { id: input.id, projectId, entityLabel },
          });
        }

        return;
      }

      const variantScope = await verifyVariantScope(
        input.id,
        projectId,
        `useGenerationMutations.useDeleteFromTable.${table}.scopeValidation`,
      );
      const { data, error } = await deleteGenerationVariantByScope({
        id: input.id,
        generationId: variantScope.generationId,
      });

      if (error) {
        normalizeAndPresentAndRethrow(error, {
          context: `useGenerationMutations.useDeleteFromTable.${table}`,
          showToast: false,
          logData: { id: input.id, projectId, entityLabel, generationId: variantScope.generationId },
        });
      }

      if (!data || data.length === 0) {
        normalizeAndPresentAndRethrow(new Error('No rows deleted while enforcing variant scope'), {
          context: `useGenerationMutations.useDeleteFromTable.${table}.noRows`,
          showToast: false,
          logData: { id: input.id, projectId, entityLabel, generationId: variantScope.generationId },
        });
      }
    },
    onError: (error: Error) => {
      normalizeAndPresentError(error, {
        context: `useDelete${entityLabel.charAt(0).toUpperCase() + entityLabel.slice(1)}`,
        toastTitle: `Failed to delete ${entityLabel}`,
      });
    },
  });
}

export function useDeleteGeneration() {
  return useDeleteFromTable('generations', 'generation');
}

/**
 * Delete a variant from generation_variants table.
 * Use this for edit tools (edit-images, edit-video, character-animate) that create variants.
 */
export function useDeleteVariant() {
  return useDeleteFromTable('generation_variants', 'variant');
}

export function useUpdateGenerationLocation() {
  return useMutation({
    mutationFn: ({ id, location, thumbUrl, projectId }: { id: string; location: string; thumbUrl?: string; projectId: string }) => {
      return updateGenerationLocation({ id, location, thumbUrl, projectId });
    },
    onError: (error: Error) => {
      normalizeAndPresentError(error, { context: 'useUpdateGenerationLocation', toastTitle: 'Failed to update generation' });
    },
  });
}

export function useCreateGeneration() {
  return useMutation({
    mutationFn: createGeneration,
    onError: (error: Error) => {
      normalizeAndPresentError(error, { context: 'useCreateGeneration', toastTitle: 'Failed to create generation' });
    },
  });
}

export function useToggleGenerationStar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, starred, projectId }: { id: string; starred: boolean; projectId: string; shotId?: string }) => {
      return toggleGenerationStar({ id, starred, projectId });
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
            items: (data as { items: GenerationRow[] }).items.map((g) => (g.id === id ? { ...g, starred } : g)),
          };
          queryClient.setQueryData(queryKey, updated);
        }
      });

      // 2) Optimistically update all shots caches so star reflects in Shot views / timelines
      const shotsQueries = queryClient.getQueriesData({ queryKey: queryKeys.shots.all });
      shotsQueries.forEach(([queryKey, data]) => {
        if (Array.isArray(data)) {
          previousShotsQueries.set(queryKey, data);
          const updatedShots = (data as Shot[]).map((shot) => {
            if (!shot.images) return shot;
            return {
              ...shot,
              images: shot.images.map((img) => (img.id === id ? { ...img, starred } : img)),
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
      normalizeAndPresentError(error, { context: 'useToggleGenerationStar', toastTitle: 'Failed to toggle star' });
    },
    onSuccess: (_data, variables) => {
      // Emit custom event so Timeline knows to refetch star data
      if (variables.shotId) {
        dispatchAppEvent('generation-star-updated', {
          generationId: variables.id, shotId: variables.shotId!, starred: variables.starred,
        });
      }
    },
  });
}
