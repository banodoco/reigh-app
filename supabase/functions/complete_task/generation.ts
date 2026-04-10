/**
 * Generation routing for complete_task
 *
 * This file contains the main routing logic. Handlers are in generation-handlers.ts.
 * File structure:
 * - generation.ts: Routing (this file)
 * - generation-handlers.ts: All handlers
 * - generation-child.ts: Child generation + segment helpers
 * - generation-core.ts: CRUD primitives
 * - generation-parent.ts: Parent relationship helpers
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { extractShotAndPosition, extractBasedOn } from './params.ts';
import { findExistingGeneration, createVariant, linkGenerationToShot } from './generation-core.ts';
import {
  handleVariantCreation,
  handleVariantOnParent,
  handleVariantOnChild,
  handleChildGeneration,
  handleStandaloneGeneration,
} from './generation-handlers.ts';
import { TASK_TYPES } from './constants.ts';
import { assertCompletionAuthContext, type CompletionAuthContext } from './authContext.ts';
import {
  buildTaskPayloadSnapshot,
  resolveSnapshotChildGenerationId,
  resolveSnapshotChildOrder,
  resolveSnapshotIsSingleItem,
  resolveSnapshotParentGenerationId,
} from '../_shared/taskPayloadSnapshot.ts';
import { asObjectOrEmpty } from '../_shared/payloadNormalization.ts';
import { CompletionError, toCompletionError } from './errors.ts';
import type { CompletionLogger } from './types.ts';

type GenerationSkipReason =
  | 'orchestration_task'
  | 'skip_generation_flag';

interface GenerationRef {
  id: string;
}

export type CompletionAssetRef = {
  generation_id: string;
  variant_id?: string;
  location: string;
  thumbnail_url?: string;
  media_type: string;
  created_as: 'generation' | 'variant';
};

export type GenerationCreationOutcome =
  | { status: 'skipped'; reason: GenerationSkipReason }
  | { status: 'created'; generation: GenerationRef; completionAsset: CompletionAssetRef | null };

interface CompletedTaskData {
  category?: string;
  task_type?: string;
  tool_type?: string;
  content_type?: string;
  variant_type?: string | null;
  project_id?: string;
  params: Record<string, unknown>;
}

interface GenerationRouteParams {
  basedOn: string | null;
  createAsGeneration: boolean;
  childGenerationId: string | null;
  parentGenerationId: string | null;
  childOrder: number | null;
  isSingleItem: boolean;
  isStitchTask: boolean;
}

interface GenerationHandlerContext {
  supabase: SupabaseClient;
  taskId: string;
  taskData: CompletedTaskData;
  publicUrl: string;
  thumbnailUrl: string | null;
  logger?: CompletionLogger;
  childGenerationId?: string;
  parentGenerationId?: string;
  childOrder?: number | null;
  isSingleItem?: boolean;
}

type GenerationRouteAttempt =
  | 'variant_on_child'
  | 'variant_on_parent'
  | 'child_generation'
  | 'standalone';

function toGenerationRef(value: unknown): GenerationRef | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as { id?: unknown };
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    return null;
  }

  return { id: candidate.id };
}

function normalizeCompletedTaskData(taskData: unknown): CompletedTaskData {
  const record = asObjectOrEmpty(taskData);
  return {
    category: typeof record.category === 'string' ? record.category : undefined,
    task_type: typeof record.task_type === 'string' ? record.task_type : undefined,
    tool_type: typeof record.tool_type === 'string' ? record.tool_type : undefined,
    content_type: typeof record.content_type === 'string' ? record.content_type : undefined,
    variant_type: typeof record.variant_type === 'string' ? record.variant_type : null,
    project_id: typeof record.project_id === 'string' ? record.project_id : undefined,
    params: asObjectOrEmpty(record.params),
  };
}

function getGenerationSkipReason(taskData: CompletedTaskData): GenerationSkipReason | null {
  if (taskData.category === 'orchestration') {
    return 'orchestration_task';
  }

  if (taskData.params.skip_generation === true) {
    return 'skip_generation_flag';
  }

  return null;
}

function resolveGenerationRouteParams(taskData: CompletedTaskData): GenerationRouteParams {
  const params = taskData.params;
  const payloadSnapshot = buildTaskPayloadSnapshot(params);

  const basedOn = extractBasedOn(params);
  const createAsGeneration = (
    params.create_as_generation === true
    || payloadSnapshot.orchestrationContract.create_as_generation === true
  );

  const childGenerationId = resolveSnapshotChildGenerationId(payloadSnapshot);
  const parentGenerationId = resolveSnapshotParentGenerationId(payloadSnapshot);
  const childOrder = resolveSnapshotChildOrder(payloadSnapshot);
  const isSingleItem = resolveSnapshotIsSingleItem(payloadSnapshot);

  const isStitchTask = taskData.task_type === TASK_TYPES.TRAVEL_STITCH
    || taskData.task_type === TASK_TYPES.JOIN_FINAL_STITCH;

  return {
    basedOn,
    createAsGeneration,
    childGenerationId,
    parentGenerationId,
    childOrder,
    isSingleItem,
    isStitchTask,
  };
}

function classifyGenerationRouteAttempts(routeParams: GenerationRouteParams): GenerationRouteAttempt[] {
  const attempts: GenerationRouteAttempt[] = [];

  if (routeParams.childGenerationId) {
    attempts.push('variant_on_child');
  }

  if (routeParams.isStitchTask && routeParams.parentGenerationId) {
    attempts.push('variant_on_parent');
  }

  if (routeParams.parentGenerationId) {
    attempts.push('child_generation');
  }

  attempts.push('standalone');
  return attempts;
}

async function executeGenerationRouteAttempt(
  attempt: GenerationRouteAttempt,
  ctx: GenerationHandlerContext,
): Promise<{ generation: GenerationRef; completionAsset: CompletionAssetRef | null } | null> {
  switch (attempt) {
    case 'variant_on_child': {
      const generation = toGenerationRef(await handleVariantOnChild(ctx));
      return generation ? { generation, completionAsset: null } : null;
    }
    case 'variant_on_parent': {
      const generation = toGenerationRef(await handleVariantOnParent(ctx));
      return generation ? { generation, completionAsset: null } : null;
    }
    case 'child_generation': {
      const generation = toGenerationRef(await handleChildGeneration(ctx));
      return generation ? { generation, completionAsset: null } : null;
    }
    case 'standalone': {
      const standaloneResult = await handleStandaloneGeneration(ctx) as {
        id?: unknown;
        completionAsset?: CompletionAssetRef | null;
      } | null;
      const generation = toGenerationRef(standaloneResult);
      return generation
        ? {
          generation,
          completionAsset: standaloneResult?.completionAsset ?? null,
        }
        : null;
    }
  }
}

/**
 * Main function to create generation from completed task
 *
 * PARAMS-DRIVEN ROUTING - all 6 cases in one place:
 * 1. Regeneration: existing generation for this task → add variant
 * 2. Variant on source: based_on present → variant on that generation
 * 3. Variant on child: child_generation_id present → variant on existing child
 * 4. Stitch task: travel_stitch/join_final_stitch → variant on parent
 * 5. Child generation: parent_generation_id present → child under parent
 * 6. Standalone: neither → independent generation
 *
 * Single-item detection: is_single_item param OR (is_first_segment && is_last_segment)
 * Child order: child_order OR segment_index OR join_index
 */
export async function createGenerationFromTask(
  supabase: SupabaseClient,
  taskId: string,
  taskData: unknown,
  publicUrl: string,
  thumbnailUrl: string | null | undefined,
  logger?: CompletionLogger,
  authContext: CompletionAuthContext,
): Promise<GenerationCreationOutcome> {
  assertCompletionAuthContext(authContext, 'createGenerationFromTask');

  const normalizedTaskData = normalizeCompletedTaskData(taskData);
  const skipReason = getGenerationSkipReason(normalizedTaskData);
  if (skipReason) {
    return { status: 'skipped', reason: skipReason };
  }

  const routeParams = resolveGenerationRouteParams(normalizedTaskData);

  logger?.debug("Generation routing", {
    task_id: taskId,
    based_on: routeParams.basedOn,
    child_generation_id: routeParams.childGenerationId,
    parent_generation_id: routeParams.parentGenerationId,
    child_order: routeParams.childOrder,
    is_single_item: routeParams.isSingleItem,
    is_stitch_task: routeParams.isStitchTask,
  });

  try {
    const existingGenerationRaw = await findExistingGeneration(supabase, taskId);
    const existingGeneration = toGenerationRef(existingGenerationRaw);
    if (existingGenerationRaw && !existingGeneration) {
      throw new CompletionError({
        code: 'generation_existing_shape_invalid',
        context: 'createGenerationFromTask',
        recoverable: false,
        message: `Existing generation lookup returned an invalid shape for task ${taskId}`,
        metadata: { task_id: taskId },
      });
    }

    if (existingGeneration) {
      const completionAsset = await handleRegeneration(
        supabase,
        taskId,
        normalizedTaskData,
        existingGeneration,
        publicUrl,
        thumbnailUrl,
        logger,
      );
      return {
        status: 'created',
        generation: existingGeneration,
        completionAsset,
      };
    }

    if (routeParams.basedOn && !routeParams.createAsGeneration) {
      const completionAsset = await handleVariantCreation(
        supabase,
        taskId,
        normalizedTaskData,
        routeParams.basedOn,
        publicUrl,
        thumbnailUrl,
      );
      if (completionAsset) {
        return {
          status: 'created',
          generation: { id: routeParams.basedOn },
          completionAsset,
        };
      }
    }

    const handlerContext: GenerationHandlerContext = {
      supabase,
      taskId,
      taskData: normalizedTaskData,
      publicUrl,
      thumbnailUrl: thumbnailUrl || null,
      logger,
      childGenerationId: routeParams.childGenerationId ?? undefined,
      parentGenerationId: routeParams.parentGenerationId ?? undefined,
      childOrder: routeParams.childOrder,
      isSingleItem: routeParams.isSingleItem,
    };

    for (const attempt of classifyGenerationRouteAttempts(routeParams)) {
      const routeResult = await executeGenerationRouteAttempt(attempt, handlerContext);
      if (routeResult) {
        return { status: 'created', ...routeResult };
      }
    }

    throw new CompletionError({
      code: 'generation_route_no_result',
      context: 'createGenerationFromTask',
      recoverable: false,
      message: `No generation route produced a result for task ${taskId}`,
      metadata: {
        task_id: taskId,
        task_type: normalizedTaskData.task_type,
        route_attempts: classifyGenerationRouteAttempts(routeParams),
      },
    });

  } catch (error) {
    const normalizedError = toCompletionError(error, {
      code: 'generation_completion_failed',
      context: 'createGenerationFromTask',
      recoverable: true,
      message: `Failed to create generation for task ${taskId}`,
      metadata: {
        task_id: taskId,
        task_type: normalizedTaskData.task_type,
      },
    });
    logger?.error("Error creating generation", {
      task_id: taskId,
      error: normalizedError.message,
      error_code: normalizedError.code,
      recoverable: normalizedError.recoverable,
      error_context: normalizedError.context,
      error_metadata: normalizedError.metadata,
    });
    throw normalizedError;
  }
}

/**
 * Handle regeneration case - task already has a generation, create new variant
 */
async function handleRegeneration(
  supabase: SupabaseClient,
  taskId: string,
  taskData: CompletedTaskData,
  existingGeneration: GenerationRef,
  publicUrl: string,
  thumbnailUrl: string | null | undefined,
  logger?: CompletionLogger
): Promise<CompletionAssetRef> {
  logger?.info("Existing generation found - creating regenerated variant", {
    task_id: taskId,
    existing_generation_id: existingGeneration.id,
    action: "create_regenerated_variant"
  });

  const variantParams = {
    ...taskData.params,
    source_task_id: taskId,
    created_from: 'task_completion',
    tool_type: taskData.tool_type,
  };

  const variant = await createVariant(
    supabase,
    existingGeneration.id,
    publicUrl,
    thumbnailUrl || null,
    variantParams,
    true,
    'regenerated',
    null
  );

  const { shotId, addInPosition } = extractShotAndPosition(taskData.params);
  if (shotId) {
    await linkGenerationToShot(supabase, shotId, existingGeneration.id, addInPosition);
  }

  const { error: markGenerationCreatedError } = await supabase
    .from('tasks')
    .update({ generation_created: true })
    .eq('id', taskId);

  if (markGenerationCreatedError) {
    throw new CompletionError({
      code: 'regeneration_generation_created_update_failed',
      context: 'handleRegeneration',
      recoverable: true,
      message: `Failed to persist generation_created marker for task ${taskId}`,
      metadata: {
        task_id: taskId,
        existing_generation_id: existingGeneration.id,
      },
      cause: markGenerationCreatedError,
    });
  }

  return {
    generation_id: existingGeneration.id,
    variant_id: variant.id,
    location: publicUrl,
    ...(thumbnailUrl ? { thumbnail_url: thumbnailUrl } : {}),
    media_type: taskData.content_type || 'image',
    created_as: 'variant',
  };
}
