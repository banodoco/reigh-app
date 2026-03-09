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
import type { Json } from '@/integrations/supabase/jsonTypes';
import {
  createGenerationPrimaryVariant,
  createGenerationRecord,
  deleteGenerationInProject,
  deleteVariantInGeneration,
  updateGenerationLocationInProject,
  updateGenerationStarInProject,
  type ExternalUploadGenerationParams,
} from '@/integrations/supabase/repositories/generationMutationsRepository';
import {
  normalizeAndPresentAndRethrow,
  normalizeAndPresentError,
} from '@/shared/lib/errorHandling/runtimeError';
import { dispatchAppEvent } from '@/shared/lib/typedEvents';
import { VARIANT_TYPE } from '@/shared/constants/variantTypes';
import {
  applyOptimisticGenerationStarUpdate,
  rollbackOptimisticGenerationStarUpdate,
} from '@/shared/hooks/invalidation/generationStarCacheCoordinator';
import {
  resolveGenerationProjectScope,
  resolveVariantProjectScope,
} from '@/shared/lib/generationTaskRepository';
import type { GenerationRow } from '@/domains/generation/types';
import type { GenerationRowDto } from '@/domains/generation/types/generationRowDto';

// ===== Helper Functions (internal) =====

interface ScopedGenerationInput {
  id: string;
  projectId: string;
}

interface ScopedVariantInput {
  id: string;
  projectId: string;
}

interface ScopedMutationRowsResult<Row extends { id: string }> {
  data: Row[] | null;
  error: unknown;
}

interface CreateGenerationInput {
  imageUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  projectId: string;
  prompt: string;
  thumbnailUrl?: string;
  resolution?: string;
  aspectRatio?: string;
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

function ensureScopedMutationRows<Row extends { id: string }>(
  result: ScopedMutationRowsResult<Row>,
  params: {
    context: string;
    emptyMessage: string;
    logData: Record<string, unknown>;
  },
): Row[] {
  if (result.error) {
    normalizeAndPresentAndRethrow(result.error, {
      context: params.context,
      showToast: false,
      logData: params.logData,
    });
  }

  if (!result.data || result.data.length === 0) {
    normalizeAndPresentAndRethrow(new Error(params.emptyMessage), {
      context: `${params.context}.noRows`,
      showToast: false,
      logData: params.logData,
    });
  }

  return result.data;
}

async function runGenerationProjectMutation<TInput extends ScopedGenerationInput, Row extends { id: string }>(
  input: TInput,
  params: {
    operation: string;
    emptyMessage: string;
    run: (validated: TInput & { projectId: string }) => Promise<ScopedMutationRowsResult<Row>>;
    logData?: (validated: TInput & { projectId: string }) => Record<string, unknown>;
  },
): Promise<Row[]> {
  const projectId = ensureProjectScope(
    input.projectId,
    `useGenerationMutations.${params.operation}.projectScope`,
  );
  const validatedInput = { ...input, projectId };
  await verifyGenerationScope(
    input.id,
    projectId,
    `useGenerationMutations.${params.operation}.scopeValidation`,
  );

  const result = await params.run(validatedInput);
  return ensureScopedMutationRows(result, {
    context: `useGenerationMutations.${params.operation}`,
    emptyMessage: params.emptyMessage,
    logData: params.logData?.(validatedInput) ?? { id: input.id, projectId },
  });
}

async function runVariantProjectMutation<Row extends { id: string }>(
  input: ScopedVariantInput,
  params: {
    operation: string;
    emptyMessage: string;
    run: (validated: { id: string; projectId: string; generationId: string }) => Promise<ScopedMutationRowsResult<Row>>;
  },
): Promise<Row[]> {
  const projectId = ensureProjectScope(
    input.projectId,
    `useGenerationMutations.${params.operation}.projectScope`,
  );
  const variantScope = await verifyVariantScope(
    input.id,
    projectId,
    `useGenerationMutations.${params.operation}.scopeValidation`,
  );

  return ensureScopedMutationRows(
    await params.run({
      id: input.id,
      projectId,
      generationId: variantScope.generationId,
    }),
    {
      context: `useGenerationMutations.${params.operation}`,
      emptyMessage: params.emptyMessage,
      logData: { id: input.id, projectId, generationId: variantScope.generationId },
    },
  );
}

function buildExternalUploadGenerationParams(input: CreateGenerationInput): ExternalUploadGenerationParams {
  return {
    prompt: input.prompt,
    extra: {
      source: 'external_upload',
      original_filename: input.fileName,
      file_type: input.fileType,
      file_size: input.fileSize,
    },
    ...(input.resolution ? { resolution: input.resolution } : {}),
    ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
  };
}

function mapCreatedGenerationRow(dto: GenerationRowDto & { params?: Json | null }): GenerationRow {
  return {
    id: dto.id,
    generation_id: dto.generation_id,
    location: dto.location ?? null,
    type: dto.type ?? null,
    createdAt: dto.createdAt ?? dto.created_at,
    metadata: dto.metadata ?? null,
    name: dto.name ?? null,
    timeline_frame: dto.timeline_frame ?? null,
    starred: dto.starred,
    based_on: dto.based_on ?? null,
    params: (dto.params ?? undefined) as GenerationRow['params'],
    parent_generation_id: dto.parent_generation_id ?? null,
    is_child: dto.is_child,
    child_order: dto.child_order ?? null,
    pair_shot_generation_id: dto.pair_shot_generation_id ?? null,
    primary_variant_id: dto.primary_variant_id ?? null,
    source_task_id: dto.source_task_id ?? null,
  };
}

/**
 * Update generation location using direct Supabase call.
 * @internal Used by useUpdateGenerationLocation hook.
 */
async function updateGenerationLocation(
  params: ScopedGenerationInput & { location: string; thumbUrl?: string },
): Promise<void> {
  await runGenerationProjectMutation(params, {
    operation: 'updateGenerationLocation',
    emptyMessage: 'No rows updated while enforcing generation project scope',
    run: ({ id, projectId, location, thumbUrl }) => updateGenerationLocationInProject({
      id,
      projectId,
      location,
      thumbnailUrl: thumbUrl,
    }),
    logData: ({ id, projectId }) => ({ generationId: id, projectId }),
  });
}

/**
 * Create a new generation using direct Supabase call.
 * @internal Used by useCreateGeneration hook.
 */
async function createGeneration(params: CreateGenerationInput): Promise<GenerationRow> {
  const generationParams = buildExternalUploadGenerationParams(params);

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

  return mapCreatedGenerationRow(data as GenerationRowDto & { params?: Json | null });
}

/**
 * Star/unstar a generation using direct Supabase call.
 * @internal Used by useToggleGenerationStar hook.
 */
async function toggleGenerationStar(params: ScopedGenerationInput & { starred: boolean }): Promise<void> {
  await runGenerationProjectMutation(params, {
    operation: 'toggleGenerationStar',
    emptyMessage: 'No rows updated while toggling generation star (possible RLS policy issue)',
    run: ({ id, projectId, starred }) => updateGenerationStarInProject({
      id,
      projectId,
      starred,
    }),
    logData: ({ id, projectId, starred }) => ({
      generationId: id,
      projectId,
      starred,
    }),
  });
}

// ===== Mutation Hooks =====

/**
 * Delete a generation with project-scoped verification.
 */
async function deleteGenerationScoped(input: ScopedGenerationInput): Promise<void> {
  await runGenerationProjectMutation(input, {
    operation: 'deleteGeneration',
    emptyMessage: 'No rows deleted while enforcing generation scope',
    run: ({ id, projectId }) => deleteGenerationInProject({ id, projectId }),
  });
}

/**
 * Delete a variant with project-scoped verification via its parent generation.
 */
async function deleteVariantScoped(input: ScopedVariantInput): Promise<void> {
  await runVariantProjectMutation(input, {
    operation: 'deleteVariant',
    emptyMessage: 'No rows deleted while enforcing variant scope',
    run: ({ id, generationId }) => deleteVariantInGeneration({ id, generationId }),
  });
}

export function useDeleteGeneration() {
  return useMutation({
    mutationFn: deleteGenerationScoped,
    onError: (error: Error) => {
      normalizeAndPresentError(error, {
        context: 'useDeleteGeneration',
        toastTitle: 'Failed to delete generation',
      });
    },
  });
}

/**
 * Delete a variant from generation_variants table.
 * Use this for edit tools (edit-images, edit-video, character-animate) that create variants.
 */
export function useDeleteVariant() {
  return useMutation({
    mutationFn: deleteVariantScoped,
    onError: (error: Error) => {
      normalizeAndPresentError(error, {
        context: 'useDeleteVariant',
        toastTitle: 'Failed to delete variant',
      });
    },
  });
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
      return applyOptimisticGenerationStarUpdate(queryClient, {
        generationId: id,
        starred,
        shotId,
      });
    },
    onError: (error: Error, _variables, context) => {
      rollbackOptimisticGenerationStarUpdate(queryClient, context);
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
