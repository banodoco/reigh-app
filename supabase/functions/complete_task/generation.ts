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

import { extractShotAndPosition, extractBasedOn } from './params.ts';
import { findExistingGeneration, createVariant, linkGenerationToShot } from './generation-core.ts';
import {
  handleVariantCreation,
  handleVariantOnParent,
  handleVariantOnChild,
  handleChildGeneration,
  handleStandaloneGeneration,
  type HandlerContext,
} from './generation-handlers.ts';
import { TASK_TYPES } from './constants.ts';

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
  supabase: any,
  taskId: string,
  taskData: any,
  publicUrl: string,
  thumbnailUrl: string | null | undefined,
  logger?: any
): Promise<any> {
  const params = taskData.params || {};

  // Skip orchestration tasks (they coordinate, don't produce output)
  if (taskData.category === 'orchestration') {
    console.log(`[GenMigration] SKIP: Task ${taskId} is orchestration`);
    return null;
  }

  // Skip tasks that explicitly opt out of generation creation.
  // Intermediate tasks (e.g., join_clips_segment) set this at creation time —
  // the final stitch task handles the parent variant instead.
  if (params.skip_generation === true) {
    console.log(`[GenMigration] SKIP: Task ${taskId} has skip_generation=true`);
    return null;
  }

  // Extract routing params that determine which generation case applies.
  // IMPORTANT: Only extract from locations where the task creator explicitly
  // declares routing intent. full_orchestrator_payload is passthrough context
  // (not a routing directive) — if a task shouldn't create a generation,
  // set skip_generation: true at creation time instead.
  const basedOn = extractBasedOn(params);
  const createAsGeneration = params.create_as_generation === true;
  const childGenerationId = params.child_generation_id;
  const parentGenerationId = params.parent_generation_id ||
                             params.orchestrator_details?.parent_generation_id;
  const childOrder = params.child_order ?? params.segment_index ?? params.join_index ?? null;
  const isSingleItem = params.is_single_item === true ||
                       (params.is_first_segment === true && params.is_last_segment === true);

  console.log(`[GenMigration] Task ${taskId}: based_on=${basedOn || 'none'}, child_generation_id=${childGenerationId || 'none'}, parent_generation_id=${parentGenerationId || 'none'}, child_order=${childOrder}, is_single_item=${isSingleItem}`);
  logger?.debug("Generation routing", {
    task_id: taskId,
    based_on: basedOn,
    child_generation_id: childGenerationId,
    parent_generation_id: parentGenerationId,
    child_order: childOrder,
    is_single_item: isSingleItem,
  });

  try {
    // 1. REGENERATION: existing generation for this task → add variant
    const existingGeneration = await findExistingGeneration(supabase, taskId);
    if (existingGeneration) {
      return handleRegeneration(supabase, taskId, taskData, existingGeneration, publicUrl, thumbnailUrl, logger);
    }

    // 2. VARIANT ON SOURCE: based_on present → variant on that generation
    if (basedOn && !createAsGeneration) {
      console.log(`[GenMigration] VARIANT: Task ${taskId} on ${basedOn}`);
      const success = await handleVariantCreation(supabase, taskId, taskData, basedOn, publicUrl, thumbnailUrl);
      if (success) return { id: basedOn }; // Return generation that received variant
      console.log(`[GenMigration] Variant creation failed, falling back to generation`);
    }

    // Build context for remaining handlers
    const ctx: HandlerContext = {
      supabase,
      taskId,
      taskData,
      publicUrl,
      thumbnailUrl: thumbnailUrl || null,
      logger,
      childGenerationId,
      parentGenerationId,
      childOrder,
      isSingleItem,
    };

    let result: any = null;

    // 3. VARIANT ON CHILD: child_generation_id present → update existing child
    if (childGenerationId) {
      console.log(`[GenMigration] VARIANT_ON_CHILD: Task ${taskId} updating child ${childGenerationId}`);
      result = await handleVariantOnChild(ctx);
      if (result) return result;
      // Fall through to child generation if variant failed
    }

    // 4. STITCH TASK: variant on parent (travel_stitch, join_final_stitch)
    // These have parent_generation_id but create a variant on parent, not a child under it
    const isStitchTask = taskData.task_type === TASK_TYPES.TRAVEL_STITCH || taskData.task_type === TASK_TYPES.JOIN_FINAL_STITCH;
    if (isStitchTask && parentGenerationId) {
      console.log(`[GenMigration] STITCH: Task ${taskId} creating variant on parent ${parentGenerationId}`);
      result = await handleVariantOnParent(ctx);
      if (result) return result;
      console.log(`[GenMigration] Stitch variant creation failed, falling back`);
    }

    // 5. CHILD GENERATION: parent_generation_id present → child under parent
    if (parentGenerationId) {
      console.log(`[GenMigration] CHILD: Task ${taskId} under parent ${parentGenerationId}`);
      result = await handleChildGeneration(ctx);
      if (result) return result;
      console.log(`[GenMigration] Child creation failed, falling back to standalone`);
    }

    // 6. STANDALONE: no parent/child relationship
    console.log(`[GenMigration] STANDALONE: Task ${taskId}`);
    return handleStandaloneGeneration(ctx);

  } catch (error) {
    console.error(`[GenMigration] Error creating generation for task ${taskId}:`, error);
    logger?.error("Error creating generation", {
      task_id: taskId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * Handle regeneration case - task already has a generation, create new variant
 */
async function handleRegeneration(
  supabase: any,
  taskId: string,
  taskData: any,
  existingGeneration: any,
  publicUrl: string,
  thumbnailUrl: string | null | undefined,
  logger?: any
): Promise<any> {
  console.log(`[GenMigration] Generation already exists for task ${taskId}: ${existingGeneration.id}`);
  console.log(`[GenMigration] Creating new variant and making it primary`);
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

  console.log(`[GenMigration] Successfully created regenerated variant for generation ${existingGeneration.id}`);

  const { shotId, addInPosition } = extractShotAndPosition(taskData.params);
  if (shotId) {
    await linkGenerationToShot(supabase, shotId, existingGeneration.id, addInPosition);
  }

  await supabase
    .from('tasks')
    .update({ generation_created: true })
    .eq('id', taskId);

  return existingGeneration;
}
