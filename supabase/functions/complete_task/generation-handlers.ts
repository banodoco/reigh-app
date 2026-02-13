/**
 * Task Completion Handlers - ALL handlers in one place
 *
 * PARAMS-DRIVEN (no config needed):
 * - handleVariantCreation: Has based_on → variant on source generation
 * - handleVariantOnChild: Has child_generation_id → variant on existing child
 * - handleVariantOnParent: Stitch task → variant on parent generation
 * - handleChildGeneration: Has parent_generation_id → child under parent (in generation-child.ts)
 * - handleStandaloneGeneration: Neither → independent generation
 *
 * All routing is determined by params extracted in createGenerationFromTask
 */

import { VARIANT_TYPE_DEFAULT } from './constants.ts';

import {
  extractBasedOn,
  extractShotAndPosition,
  buildGenerationParams,
} from './params.ts';

import {
  insertGeneration,
  createVariant,
  linkGenerationToShot,
  findSourceGenerationByImageUrl,
} from './generation-core.ts';

import {
  getOrCreateParentGeneration,
  createVariantOnParent,
  getChildVariantViewedAt,
} from './generation-parent.ts';

// Re-export child generation handlers for backward compatibility
export {
  handleChildGeneration,
  createSingleItemVariant,
  findExistingGenerationAtPosition,
  createChildGenerationRecord,
} from './generation-child.ts';

// ===== TYPES =====

export interface HandlerContext {
  supabase: any;
  taskId: string;
  taskData: any;
  publicUrl: string;
  thumbnailUrl: string | null;
  logger?: any;
  // Extracted params for routing (set by createGenerationFromTask)
  childGenerationId?: string;
  parentGenerationId?: string;
  childOrder?: number | null;
  isSingleItem?: boolean;
}

// ===== HANDLER: VARIANT ON SOURCE =====

/**
 * Create variant on source generation (for edit/upscale tasks with based_on)
 * Reads is_primary and variant_type from task data
 */
export async function handleVariantCreation(
  supabase: any,
  taskId: string,
  taskData: any,
  basedOnGenerationId: string,
  publicUrl: string,
  thumbnailUrl: string | null
): Promise<boolean> {
  const isPrimary = taskData.params?.is_primary === true;
  const variantType = taskData.variant_type || VARIANT_TYPE_DEFAULT;

  console.log(`[Variant] Task ${taskId} creating ${variantType} variant on ${basedOnGenerationId} (is_primary=${isPrimary})`);

  try {
    const { data: sourceGen, error: fetchError } = await supabase
      .from('generations')
      .select('id, params, thumbnail_url, project_id')
      .eq('id', basedOnGenerationId)
      .single();

    if (fetchError || !sourceGen) {
      console.error(`[Variant] Source generation ${basedOnGenerationId} not found:`, fetchError);
      return false;
    }

    const variantParams = {
      ...taskData.params,
      source_task_id: taskId,
      source_variant_id: taskData.params?.source_variant_id || null,
      created_from: taskData.task_type,
      tool_type: taskData.tool_type,
      content_type: taskData.content_type,
    };

    await createVariant(
      supabase,
      basedOnGenerationId,
      publicUrl,
      thumbnailUrl,
      variantParams,
      isPrimary,
      variantType,
      null
    );

    console.log(`[Variant] Successfully created ${variantType} variant on ${basedOnGenerationId} (is_primary=${isPrimary})`);

    await supabase.from('tasks').update({ generation_created: true }).eq('id', taskId);
    return true;

  } catch (variantErr) {
    console.error(`[Variant] Error creating variant for task ${taskId}:`, variantErr);
    return false;
  }
}

// ===== HANDLER: VARIANT ON PARENT =====

/**
 * Creates a variant on the parent generation (for stitch tasks)
 * Used by: travel_stitch, join_final_stitch
 */
export async function handleVariantOnParent(ctx: HandlerContext): Promise<any | null> {
  const { supabase, taskId, taskData, publicUrl, thumbnailUrl, logger } = ctx;

  const orchTaskId = taskData.params?.orchestrator_task_id_ref ||
                     taskData.params?.orchestrator_task_id ||
                     taskData.params?.full_orchestrator_payload?.orchestrator_task_id;

  if (!orchTaskId) {
    console.log(`[GenHandler] ${taskData.task_type} task ${taskId} - no orchestrator_task_id found`);
    return null;
  }

  console.log(`[GenHandler] ${taskData.task_type} - getting parent generation for orchestrator ${orchTaskId}`);
  const parentGen = await getOrCreateParentGeneration(supabase, orchTaskId, taskData.project_id, taskData.params);

  if (!parentGen?.id) {
    console.log(`[GenHandler] ${taskData.task_type} task ${taskId} - could not find/create parent generation`);
    return null;
  }

  console.log(`[GenHandler] ${taskData.task_type} task ${taskId} - creating variant on parent generation ${parentGen.id}`);
  logger?.info(`${taskData.task_type}: creating variant on parent`, {
    task_id: taskId,
    parent_generation_id: parentGen.id,
    orchestrator_task_id: orchTaskId,
    action: "create_variant_on_parent"
  });

  const variantType = taskData.variant_type || VARIANT_TYPE_DEFAULT;

  const result = await createVariantOnParent(
    supabase,
    parentGen.id,
    publicUrl,
    thumbnailUrl,
    taskData,
    taskId,
    variantType,
    {
      tool_type: taskData.tool_type,
      created_from: `${taskData.task_type}_completion`,
    }
  );

  // For loop tasks with based_on (e.g., "Add to Join" loop), also create variant on source generation
  const orchDetails = taskData.params?.orchestrator_details || taskData.params?.full_orchestrator_payload || {};
  const isLoop = orchDetails.loop_first_clip === true;
  const basedOnId = orchDetails.based_on || taskData.params?.based_on;

  if (isLoop && basedOnId) {
    console.log(`[GenHandler] Loop with based_on detected - also creating variant on source generation ${basedOnId}`);
    logger?.info(`${taskData.task_type}: creating loop variant on source`, {
      task_id: taskId,
      based_on: basedOnId,
      action: "create_loop_variant_on_source"
    });

    // Verify the source generation exists before creating variant
    const { data: sourceGen, error: sourceError } = await supabase
      .from('generations')
      .select('id')
      .eq('id', basedOnId)
      .maybeSingle();

    if (sourceGen && !sourceError) {
      await createVariant(
        supabase,
        basedOnId,
        publicUrl,
        thumbnailUrl,
        {
          ...taskData.params,
          source_task_id: taskId,
          tool_type: taskData.tool_type,
          created_from: 'loop_variant',
        },
        true, // is_primary - make this the new primary variant
        'clip_join', // variant_type
        null
      );
      console.log(`[GenHandler] Successfully created loop variant on source generation ${basedOnId}`);
    } else {
      console.warn(`[GenHandler] Source generation ${basedOnId} not found, skipping loop variant`);
    }
  }

  return result;
}

// ===== HANDLER: VARIANT ON CHILD =====

/**
 * Creates a variant on an existing child generation (for individual segment regeneration)
 * Used by: individual_travel_segment (when child_generation_id is present)
 */
export async function handleVariantOnChild(ctx: HandlerContext): Promise<any | null> {
  const { supabase, taskId, taskData, publicUrl, thumbnailUrl, logger, childGenerationId } = ctx;

  if (!childGenerationId) {
    console.log(`[GenHandler] No child_generation_id, falling back to child_generation behavior`);
    return null; // Fall back to child_generation behavior
  }

  const childGenId = childGenerationId;

  console.log(`[GenHandler] individual_travel_segment - creating variant for child generation ${childGenId}`);
  logger?.info("individual_travel_segment with child_generation_id", {
    task_id: taskId,
    child_generation_id: childGenId,
    action: "create_variant_on_existing_child"
  });

  const { data: childGen, error: fetchError } = await supabase
    .from('generations')
    .select('*')
    .eq('id', childGenId)
    .single();

  if (fetchError || !childGen) {
    console.error(`[GenHandler] Error fetching child generation ${childGenId}:`, fetchError);
    return null;
  }

  // Extract pair_shot_generation_id from nested locations if not at top level
  const segmentIndex = taskData.params?.segment_index ?? 0;
  const orchPairIds = taskData.params?.orchestrator_details?.pair_shot_generation_ids;
  const pairShotGenerationId = taskData.params?.pair_shot_generation_id ||
                                taskData.params?.individual_segment_params?.pair_shot_generation_id ||
                                (Array.isArray(orchPairIds) && orchPairIds[segmentIndex]);

  const variantParams = {
    ...taskData.params,
    tool_type: taskData.tool_type,
    source_task_id: taskId,
    created_from: 'individual_segment_regeneration',
    ...(pairShotGenerationId && { pair_shot_generation_id: pairShotGenerationId }),
  };

  // Respect make_primary_variant flag from UI (defaults to true for backward compatibility)
  const makePrimary = taskData.params?.make_primary_variant ?? true;
  console.log(`[GenHandler] Creating variant with isPrimary=${makePrimary}`);

  // Always check for single-segment case (independent of makePrimary flag)
  // This determines if we should propagate to the parent generation
  const singleSegmentViewedAt = await getChildVariantViewedAt(supabase, {
    taskParams: taskData.params,
    childGeneration: childGen,
  });
  const isSingleSegmentChild = singleSegmentViewedAt !== null;

  // For the child variant, only auto-view if makePrimary is true
  const childViewedAt = makePrimary ? singleSegmentViewedAt : null;

  const variantType = taskData.variant_type || VARIANT_TYPE_DEFAULT;

  await createVariant(
    supabase,
    childGen.id,
    publicUrl,
    thumbnailUrl,
    variantParams,
    makePrimary,
    variantType,
    null,
    childViewedAt
  );

  console.log(`[GenHandler] Successfully created variant for child generation ${childGenId}${childViewedAt ? ' (auto-viewed)' : ''}${isSingleSegmentChild ? ' (single-segment)' : ''}`);

  // SINGLE-SEGMENT PROPAGATION: If this child is the only child of its parent,
  // also create a variant on the parent so the main generation updates automatically
  if (isSingleSegmentChild && childGen.parent_generation_id) {
    // Check if parent already has variants - only make primary if it's the first
    const { count: existingParentVariants } = await supabase
      .from('generation_variants')
      .select('id', { count: 'exact', head: true })
      .eq('generation_id', childGen.parent_generation_id);

    const isFirstParentVariant = (existingParentVariants || 0) === 0;
    const makeParentPrimary = isFirstParentVariant || makePrimary;

    console.log(`[GenHandler] Single-segment child - also creating variant on parent ${childGen.parent_generation_id} (isFirst=${isFirstParentVariant}, makePrimary=${makeParentPrimary})`);
    logger?.info("Single-segment propagation to parent", {
      task_id: taskId,
      child_generation_id: childGenId,
      parent_generation_id: childGen.parent_generation_id,
      action: "propagate_to_parent",
      is_first_parent_variant: isFirstParentVariant,
      make_primary: makeParentPrimary
    });

    await createVariant(
      supabase,
      childGen.parent_generation_id,
      publicUrl,
      thumbnailUrl,
      {
        ...variantParams,
        propagated_from_child: childGenId,
        created_from: 'single_segment_propagation',
      },
      makeParentPrimary,
      variantType, // Use same variant_type as child
      null
    );
    console.log(`[GenHandler] Successfully propagated to parent generation`);
  }

  await supabase.from('tasks').update({ generation_created: true }).eq('id', taskId);
  return childGen;
}

// ===== HANDLER: STANDALONE GENERATION =====

/**
 * Creates an independent generation (for regular tasks)
 * Used by: single_image, wan_2_2_i2v, image_inpaint, etc.
 */
export async function handleStandaloneGeneration(ctx: HandlerContext): Promise<any> {
  const { supabase, taskId, taskData, publicUrl, thumbnailUrl, logger } = ctx;

  const { shotId, addInPosition } = extractShotAndPosition(taskData.params);

  // Validate shot exists
  if (shotId) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(shotId)) {
      const { data: shotData, error: shotError } = await supabase.from('shots').select('id').eq('id', shotId).single();
      if (shotError || !shotData) {
        console.log(`[GenHandler] Shot ${shotId} does not exist, proceeding without shot link`);
      }
    }
  }

  const generationType = taskData.content_type || 'image';
  const generationParams = buildGenerationParams(
    taskData.params, taskData.tool_type, generationType, shotId, thumbnailUrl || undefined, taskId
  );
  const newGenerationId = crypto.randomUUID();

  const generationName = taskData.params?.generation_name ||
    taskData.params?.orchestrator_details?.generation_name ||
    taskData.params?.full_orchestrator_payload?.generation_name;

  // Find based_on
  let basedOnGenerationId: string | null = extractBasedOn(taskData.params);
  if (basedOnGenerationId) {
    const { data: basedOnGen, error: basedOnError } = await supabase
      .from('generations')
      .select('id')
      .eq('id', basedOnGenerationId)
      .maybeSingle();

    if (basedOnError || !basedOnGen) {
      console.warn(`[GenHandler] based_on generation ${basedOnGenerationId} not found, clearing reference`);
      basedOnGenerationId = null;
    }
  }
  if (!basedOnGenerationId) {
    const sourceImageUrl = taskData.params?.image;
    if (sourceImageUrl) {
      basedOnGenerationId = await findSourceGenerationByImageUrl(supabase, sourceImageUrl);
    }
  }

  logger?.info("Creating standalone generation", {
    task_id: taskId,
    generation_id: newGenerationId,
    based_on: basedOnGenerationId,
    shot_id: shotId,
    generation_type: generationType,
  });

  const generationRecord: Record<string, any> = {
    id: newGenerationId,
    tasks: [taskId],
    params: generationParams,
    type: generationType,
    project_id: taskData.project_id,
    name: generationName,
    based_on: basedOnGenerationId,
    parent_generation_id: null,
    is_child: false,
    child_order: null,
    created_at: new Date().toISOString()
  };

  const newGeneration = await insertGeneration(supabase, generationRecord);
  console.log(`[GenHandler] Created standalone generation ${newGeneration.id}`);

  // Create "original" variant
  console.log(`[GenHandler] Creating original variant`);
  await createVariant(
    supabase, newGeneration.id, publicUrl, thumbnailUrl,
    { ...generationParams, source_task_id: taskId, created_from: 'generation_original' },
    true, 'original', null, null
  );

  // Link to shot if applicable
  if (shotId) {
    await linkGenerationToShot(supabase, shotId, newGeneration.id, addInPosition);
  }

  await supabase.from('tasks').update({ generation_created: true }).eq('id', taskId);

  console.log(`[GenHandler] Standalone generation creation complete`);
  return newGeneration;
}
