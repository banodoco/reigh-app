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

import type { SupabaseClient } from '../_shared/supabaseClient.ts';
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

type GenerationSkipReason =
  | 'orchestration_task'
  | 'skip_generation_flag';

interface GenerationRef {
  id: string;
}

export type GenerationCreationOutcome =
  | { status: 'skipped'; reason: GenerationSkipReason }
  | { status: 'created'; generation: GenerationRef };

interface CompletedTaskData {
  category?: string;
  task_type?: string;
  tool_type?: string;
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
  logger?: unknown;
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
): Promise<GenerationRef | null> {
  switch (attempt) {
    case 'variant_on_child':
      return toGenerationRef(await handleVariantOnChild(ctx));
    case 'variant_on_parent':
      return toGenerationRef(await handleVariantOnParent(ctx));
    case 'child_generation':
      return toGenerationRef(await handleChildGeneration(ctx));
    case 'standalone':
      return toGenerationRef(await handleStandaloneGeneration(ctx));
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
  logger?: unknown,
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
      const generation = await handleRegeneration(
        supabase,
        taskId,
        normalizedTaskData,
        existingGeneration,
        publicUrl,
        thumbnailUrl,
        logger,
      );
      return { status: 'created', generation };
    }

    if (routeParams.basedOn && !routeParams.createAsGeneration) {
      const success = await handleVariantCreation(
        supabase,
        taskId,
        normalizedTaskData,
        routeParams.basedOn,
        publicUrl,
        thumbnailUrl,
      );
      if (success) {
        return { status: 'created', generation: { id: routeParams.basedOn } };
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
      const generation = await executeGenerationRouteAttempt(attempt, handlerContext);
      if (generation) {
        return { status: 'created', generation };
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
  logger?: unknown
): Promise<GenerationRef> {
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

  await createVariant(
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

  return existingGeneration;
}
