/**
 * Child Generation Handlers
 *
 * Handles creating child generations under a parent:
 * - handleChildGeneration: Main entry point for segment tasks
 * - createSingleItemVariant: Creates variant on parent for single-item cases
 * - findExistingGenerationAtPosition: Finds existing child at position for variant creation
 * - createChildGenerationRecord: Creates the actual child generation record
 *
 * Also includes segment-specific helpers (merged from generation-segments.ts):
 * - logSegmentMasterState: Debug logging for segment creation
 * - extractSegmentSpecificParams: Extract per-segment params from orchestrator arrays
 */

import { TASK_TYPES, VARIANT_TYPE_DEFAULT } from './constants.ts';
import { extractBasedOn, extractShotAndPosition, buildGenerationParams } from './params.ts';
import { insertGeneration, createVariant, findSourceGenerationByImageUrl, extractFromArray } from './generation-core.ts';
import { createVariantOnParent, getChildVariantViewedAt } from './generation-parent.ts';
import type { HandlerContext } from './generation-handlers.ts';

// ===== HANDLER: CHILD GENERATION =====

/**
 * Creates a child generation under a parent (for segment tasks)
 * All behavior is params-driven via ctx.isSingleItem
 * Used by: travel_segment, join_clips_segment, individual_travel_segment (fallback)
 */
export async function handleChildGeneration(ctx: HandlerContext): Promise<any | null> {
  const { supabase, taskId, taskData, publicUrl, thumbnailUrl, logger, parentGenerationId, childOrder, isSingleItem } = ctx;

  // Must have parent generation to create child
  if (!parentGenerationId) {
    console.log(`[GenHandler] No parent generation found for child_generation task ${taskId}`);
    return null;
  }

  // Use childOrder from context (already extracted from params)
  const finalChildOrder = childOrder ?? null;

  console.log(`[GenHandler] Child generation: parent=${parentGenerationId}, childOrder=${finalChildOrder}, isSingleItem=${isSingleItem}`);
  logger?.info("Creating child generation", {
    task_id: taskId,
    parent_generation_id: parentGenerationId,
    child_order: finalChildOrder,
    is_single_item: isSingleItem,
    task_type: taskData.task_type,
  });

  // Handle single-item case: create variant on parent AND child generation
  // (Travel sends is_single_item for n=1; Join doesn't use single-item handling)
  if (isSingleItem) {
    taskData.params._isSingleSegmentCase = true;
    console.log(`[GenHandler] Single-item detected`);

    logger?.info("Single-item detected", {
      task_id: taskId,
      parent_generation_id: parentGenerationId,
    });

    await createSingleItemVariant(ctx, parentGenerationId);
    console.log(`[GenHandler] Single-item parent variant created, continuing to create child`);
  }

  // Extract segment-specific params from orchestrator details
  const orchDetails = taskData.params?.orchestrator_details ||
                      taskData.params?.full_orchestrator_payload || {};
  if (Object.keys(orchDetails).length > 0 && finalChildOrder !== null && !isNaN(finalChildOrder)) {
    taskData.params = extractSegmentSpecificParams(taskData.params, orchDetails, finalChildOrder);
    if (isSingleItem) {
      taskData.params._isSingleSegmentCase = true;
    }
  }

  // Extract pair_shot_generation_id from multiple nested locations
  // (individual_travel_segment stores it in individual_segment_params)
  const segmentIndex = taskData.params?.segment_index ?? finalChildOrder ?? 0;
  const orchPairIds = taskData.params?.orchestrator_details?.pair_shot_generation_ids;
  const pairShotGenId = taskData.params?.pair_shot_generation_id ||
                        taskData.params?.individual_segment_params?.pair_shot_generation_id ||
                        (Array.isArray(orchPairIds) && orchPairIds[segmentIndex]);

  // Check for existing generation at same position (always check for segment tasks)
  if (finalChildOrder !== null && !isNaN(finalChildOrder)) {
    const existingGenId = await findExistingGenerationAtPosition(
      supabase, parentGenerationId, finalChildOrder, pairShotGenId
    );

    if (existingGenId) {
      const variantViewedAt = await getChildVariantViewedAt(supabase, {
        taskParams: taskData.params,
        parentGenerationId,
      });

      console.log(`[GenHandler] Found existing generation ${existingGenId} - adding as variant${variantViewedAt ? ' (auto-viewed)' : ''}`);
      logger?.info("Adding segment as variant to existing generation", {
        task_id: taskId,
        existing_generation_id: existingGenId,
        child_order: finalChildOrder,
      });

      const variantTypeForExisting = taskData.variant_type || VARIANT_TYPE_DEFAULT;

      const variantResult = await createVariantOnParent(
        supabase, existingGenId, publicUrl, thumbnailUrl, taskData, taskId,
        variantTypeForExisting,
        {
          tool_type: taskData.tool_type,
          created_from: 'segment_variant_at_position',
          segment_index: finalChildOrder,
          pair_shot_generation_id: pairShotGenId
        },
        null,
        false,
        variantViewedAt
      );

      if (variantResult) return variantResult;
      console.error(`[GenHandler] Failed to create variant, falling through to new generation`);
    }
  }

  // Create the child generation
  return createChildGenerationRecord(ctx, parentGenerationId, finalChildOrder, isSingleItem || false, pairShotGenId);
}

// ===== SINGLE-ITEM VARIANT CREATION =====

/**
 * Create variant on parent for single-item cases
 */
export async function createSingleItemVariant(
  ctx: HandlerContext,
  parentGenerationId: string
): Promise<any | null> {
  const { supabase, taskId, taskData, publicUrl, thumbnailUrl, childOrder } = ctx;

  // Check if this is first variant on parent
  const { count: existingVariantCount } = await supabase
    .from('generation_variants')
    .select('id', { count: 'exact', head: true })
    .eq('generation_id', parentGenerationId);
  const isFirstVariant = (existingVariantCount || 0) === 0;

  const toolType = taskData.params?.full_orchestrator_payload?.tool_type ||
                   taskData.params?.tool_type ||
                   taskData.tool_type;

  const variantType = taskData.variant_type || VARIANT_TYPE_DEFAULT;

  const result = await createVariantOnParent(
    supabase, parentGenerationId, publicUrl, thumbnailUrl, taskData, taskId,
    variantType,
    {
      tool_type: toolType,
      created_from: 'single_item_completion',
      is_single_item: true,
      child_order: childOrder ?? 0,
    },
    null,
    isFirstVariant
  );

  return result;
}

/**
 * Find existing generation at a position (for variant creation)
 */
export async function findExistingGenerationAtPosition(
  supabase: any,
  parentGenerationId: string,
  childOrder: number,
  pairShotGenId?: string
): Promise<string | null> {
  console.log(`[GenHandler] Checking for existing generation at segment_index=${childOrder}, pair_shot_gen_id=${pairShotGenId || 'none'}`);

  // Strategy 1: Try to find by pair_shot_generation_id column
  if (pairShotGenId) {
    // Match by the FK column (source of truth with referential integrity)
    const { data: matchByColumn, error: matchByColumnError } = await supabase
      .from('generations')
      .select('id')
      .eq('parent_generation_id', parentGenerationId)
      .eq('is_child', true)
      .eq('pair_shot_generation_id', pairShotGenId)
      .maybeSingle();

    if (!matchByColumnError && matchByColumn?.id) {
      console.log(`[GenHandler] Found match by pair_shot_generation_id column: ${matchByColumn.id}`);
      return matchByColumn.id;
    }

    // NOTE: We intentionally DON'T fall back to params JSONB here.
    // Pre-migration generations have already been migrated to the column.
    // Any generation with NULL column but non-NULL params is orphaned
    // (FK cascade set column to NULL when shot_generation was deleted).
    console.log(`[GenHandler] No match by pair_shot_generation_id column`);
  }

  // Strategy 2: Fallback to child_order match
  // IMPORTANT: Only use this fallback when NO pair_shot_generation_id was provided
  // If pairShotGenId was provided but no match found, DON'T fall back to child_order
  // because the existing child at that index may be for a different timeline layout
  if (!pairShotGenId) {
    const { data: matchByChildOrder, error: matchByChildOrderError } = await supabase
      .from('generations')
      .select('id')
      .eq('parent_generation_id', parentGenerationId)
      .eq('is_child', true)
      .eq('child_order', childOrder)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!matchByChildOrderError && matchByChildOrder?.id) {
      console.log(`[GenHandler] Found match by child_order=${childOrder}: ${matchByChildOrder.id}`);
      return matchByChildOrder.id;
    }
  } else {
    console.log(`[GenHandler] No match by pair_shot_generation_id, skipping child_order fallback (would match wrong slot after timeline rearrangement)`);
  }

  console.log(`[GenHandler] No existing generation found at position`);
  return null;
}

/**
 * Create the child generation record and its initial variant
 */
export async function createChildGenerationRecord(
  ctx: HandlerContext,
  parentGenerationId: string,
  childOrder: number | null,
  isSingleItemCase: boolean,
  pairShotGenerationId?: string | null | false
): Promise<any> {
  const { supabase, taskId, taskData, publicUrl, thumbnailUrl, logger } = ctx;

  const { shotId } = extractShotAndPosition(taskData.params);
  const generationType = taskData.content_type || 'video';
  const toolType = taskData.tool_type;
  let generationParams = buildGenerationParams(
    taskData.params, toolType, generationType, shotId, thumbnailUrl || undefined, taskId
  );

  // Ensure pair_shot_generation_id is at top level of params (for slot matching)
  if (pairShotGenerationId && !generationParams.pair_shot_generation_id) {
    generationParams = { ...generationParams, pair_shot_generation_id: pairShotGenerationId };
    console.log(`[GenHandler] Added pair_shot_generation_id to child generation params: ${pairShotGenerationId}`);
  }

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

  logger?.info("Creating child generation record", {
    task_id: taskId,
    generation_id: newGenerationId,
    parent_generation_id: parentGenerationId,
    child_order: childOrder,
    is_single_item: isSingleItemCase,
    based_on: basedOnGenerationId,
    pair_shot_generation_id: pairShotGenerationId || null,
  });

  // Verify pair_shot_generation_id still exists before inserting (FK constraint check)
  // If the shot_generation was deleted between task creation and completion, set to NULL
  let validatedPairShotGenId = pairShotGenerationId || null;
  if (validatedPairShotGenId) {
    let shotGenQuery = supabase
      .from('shot_generations')
      .select('id')
      .eq('id', validatedPairShotGenId);

    // Scope to current shot to avoid matching a generation in a different shot
    if (shotId) {
      shotGenQuery = shotGenQuery.eq('shot_id', shotId);
    }

    const { data: shotGenExists } = await shotGenQuery.maybeSingle();

    if (!shotGenExists) {
      console.log(`[GenHandler] pair_shot_generation_id ${validatedPairShotGenId} no longer exists${shotId ? ` in shot ${shotId}` : ''}, setting to NULL`);
      validatedPairShotGenId = null;
    }
  }

  const generationRecord: Record<string, any> = {
    id: newGenerationId,
    tasks: [taskId],
    params: generationParams,
    type: generationType,
    project_id: taskData.project_id,
    name: generationName,
    based_on: basedOnGenerationId,
    parent_generation_id: parentGenerationId,
    is_child: true,
    child_order: childOrder,
    // Store pair_shot_generation_id as proper column (not just in params)
    // This enables FK constraint and ON DELETE SET NULL behavior
    // Validated above to prevent FK violation if shot_generation was deleted
    pair_shot_generation_id: validatedPairShotGenId,
    created_at: new Date().toISOString()
  };

  const newGeneration = await insertGeneration(supabase, generationRecord);
  console.log(`[GenHandler] Created child generation ${newGeneration.id}`);

  // Log segment state for debugging (travel segments only)
  const isTravelSegmentTask = taskData.task_type === TASK_TYPES.TRAVEL_SEGMENT ||
                               taskData.task_type === TASK_TYPES.INDIVIDUAL_TRAVEL_SEGMENT;
  const orchDetails = taskData.params?.orchestrator_details ||
                      taskData.params?.full_orchestrator_payload || {};

  if (isTravelSegmentTask && childOrder !== null) {
    try {
      logSegmentMasterState({
        taskId,
        generationId: newGeneration.id,
        segmentIndex: childOrder,
        parentGenerationId,
        orchDetails,
        segmentParams: taskData.params,
        shotId,
      });
    } catch (logError) {
      console.warn('[GenHandler] Error logging segment state:', logError);
    }
  }

  // Create "original" variant
  let autoViewedAt: string | null = null;
  let createdFrom = 'child_generation_original';

  if (isSingleItemCase) {
    autoViewedAt = new Date().toISOString();
    createdFrom = 'single_segment_child_original';
  } else {
    autoViewedAt = await getChildVariantViewedAt(supabase, {
      taskParams: taskData.params,
    });
    if (autoViewedAt) {
      createdFrom = 'single_segment_child_original';
    }
  }

  console.log(`[GenHandler] Creating original variant${autoViewedAt ? ' (auto-viewed)' : ''}`);
  await createVariant(
    supabase, newGeneration.id, publicUrl, thumbnailUrl,
    { ...generationParams, source_task_id: taskId, created_from: createdFrom },
    true, 'original', null, autoViewedAt
  );

  await supabase.from('tasks').update({ generation_created: true }).eq('id', taskId);

  console.log(`[GenHandler] Child generation creation complete`);
  return newGeneration;
}

// ===== SEGMENT-SPECIFIC HELPERS =====
// (Merged from generation-segments.ts)

/**
 * Logs a comprehensive summary of a segment after creation.
 * For debugging FE vs BE discrepancies in travel segment generation.
 */
function logSegmentMasterState(params: {
  taskId: string;
  generationId: string;
  segmentIndex: number;
  parentGenerationId: string | null;
  orchDetails: any;
  segmentParams: any;
  shotId?: string;
}) {
  const TAG = '[SEGMENT_MASTER_STATE]';
  const divider = '═'.repeat(80);
  const sectionDivider = '─'.repeat(60);

  const { taskId, generationId, segmentIndex, parentGenerationId, orchDetails, segmentParams, shotId } = params;

  console.log(`\n${divider}`);
  console.log(`${TAG} SEGMENT CREATION SUMMARY`);
  console.log(`${TAG} Task ID: ${taskId}`);
  console.log(`${TAG} Generation ID: ${generationId}`);
  console.log(`${TAG} Segment Index: ${segmentIndex}`);
  console.log(`${TAG} Parent Gen ID: ${parentGenerationId || '(none)'}`);
  console.log(`${TAG} Shot ID: ${shotId || '(none)'}`);
  console.log(`${TAG} Timestamp: ${new Date().toISOString()}`);
  console.log(divider);

  // SECTION 1: SEGMENT-SPECIFIC DATA
  console.log(`\n${TAG} SEGMENT DATA (Index ${segmentIndex})`);
  console.log(sectionDivider);

  const numFrames = segmentParams?.num_frames || extractFromArray(orchDetails?.segment_frames_expanded, segmentIndex);
  const frameOverlap = segmentParams?.frame_overlap || extractFromArray(orchDetails?.frame_overlap_expanded, segmentIndex);
  console.log(`${TAG}   Frames: ${numFrames || '(unknown)'} | Overlap: ${frameOverlap || '(unknown)'}`);

  const basePrompt = segmentParams?.prompt || extractFromArray(orchDetails?.base_prompts_expanded, segmentIndex) || orchDetails?.base_prompt || '';
  const negativePrompt = segmentParams?.negative_prompt || extractFromArray(orchDetails?.negative_prompts_expanded, segmentIndex) || '';
  const enhancedPrompt = extractFromArray(orchDetails?.enhanced_prompts_expanded, segmentIndex) || '';

  const promptPreview = basePrompt ? (basePrompt.length > 60 ? basePrompt.substring(0, 57) + '...' : basePrompt) : '(empty)';
  const hasCustomPrompt = basePrompt && basePrompt.trim().length > 0;
  const negPreview = negativePrompt ? (negativePrompt.length > 40 ? negativePrompt.substring(0, 37) + '...' : negativePrompt) : '(default)';
  const enhancedPreview = enhancedPrompt ? (enhancedPrompt.length > 50 ? enhancedPrompt.substring(0, 47) + '...' : enhancedPrompt) : '';

  console.log(`${TAG}   Prompt: ${hasCustomPrompt ? 'CUSTOM:' : 'DEFAULT:'} ${promptPreview}`);
  if (enhancedPrompt) {
    console.log(`${TAG}   Enhanced: ${enhancedPreview}`);
  }
  console.log(`${TAG}   Negative: ${negPreview}`);

  // SECTION 2: INPUT IMAGES
  console.log(`\n${TAG} INPUT IMAGES`);
  console.log(sectionDivider);

  const inputImages = orchDetails?.input_image_paths_resolved || [];
  const inputGenIds = orchDetails?.input_image_generation_ids || [];
  const pairShotGenIds = orchDetails?.pair_shot_generation_ids || [];

  const startIdx = segmentIndex;
  const endIdx = segmentIndex + 1;

  const startImageUrl = inputImages[startIdx] || '(unknown)';
  const endImageUrl = inputImages[endIdx] || '(unknown)';
  const startGenId = inputGenIds[startIdx] || '(unknown)';
  const endGenId = inputGenIds[endIdx] || '(unknown)';
  const pairShotGenId = pairShotGenIds[segmentIndex] || '(none)';

  const startUrlShort = startImageUrl.length > 50 ? '...' + startImageUrl.slice(-47) : startImageUrl;
  const endUrlShort = endImageUrl.length > 50 ? '...' + endImageUrl.slice(-47) : endImageUrl;

  console.log(`${TAG}   Start Image [${startIdx}]: ${startUrlShort}`);
  console.log(`${TAG}     Gen ID: ${typeof startGenId === 'string' ? startGenId.substring(0, 8) : startGenId}`);
  console.log(`${TAG}   End Image [${endIdx}]: ${endUrlShort}`);
  console.log(`${TAG}     Gen ID: ${typeof endGenId === 'string' ? endGenId.substring(0, 8) : endGenId}`);
  console.log(`${TAG}   Pair Shot Gen ID: ${typeof pairShotGenId === 'string' ? pairShotGenId.substring(0, 8) : pairShotGenId}`);

  // SECTION 3: STRUCTURE VIDEOS
  console.log(`\n${TAG} STRUCTURE VIDEOS`);
  console.log(sectionDivider);

  const structureVideos = orchDetails?.structure_videos || [];
  const legacyStructurePath = orchDetails?.structure_video_path;
  const segmentFramesExpanded = orchDetails?.segment_frames_expanded || [];

  let segStartFrame = 0;
  for (let i = 0; i < segmentIndex && i < segmentFramesExpanded.length; i++) {
    segStartFrame += segmentFramesExpanded[i];
  }
  const segEndFrame = segStartFrame + (segmentFramesExpanded[segmentIndex] || 0);

  console.log(`${TAG}   Segment Frame Range: ${segStartFrame} -> ${segEndFrame}`);

  if (structureVideos.length > 0) {
    let foundAffecting = false;
    structureVideos.forEach((sv: any, idx: number) => {
      const svStart = sv.start_frame || 0;
      const svEnd = sv.end_frame || 0;
      if (svStart < segEndFrame && svEnd > segStartFrame) {
        foundAffecting = true;
        const pathShort = sv.path?.length > 40 ? '...' + sv.path.slice(-37) : (sv.path || '(unknown)');
        console.log(`${TAG}   Video ${idx}: AFFECTS THIS SEGMENT`);
        console.log(`${TAG}     Path: ${pathShort}`);
        console.log(`${TAG}     Video Range: ${svStart} -> ${svEnd}`);
        console.log(`${TAG}     Type: ${sv.structure_type || 'flow'} | Treatment: ${sv.treatment || 'adjust'} | Motion: ${sv.motion_strength || 1.0}`);
      }
    });
    if (!foundAffecting) {
      console.log(`${TAG}   (No structure videos affect this segment's frame range)`);
    }
  } else if (legacyStructurePath) {
    const pathShort = legacyStructurePath.length > 40 ? '...' + legacyStructurePath.slice(-37) : legacyStructurePath;
    console.log(`${TAG}   Legacy Video: ${pathShort}`);
    console.log(`${TAG}   Type: ${orchDetails?.structure_video_type || 'flow'} | Treatment: ${orchDetails?.structure_video_treatment || 'adjust'}`);
  } else {
    console.log(`${TAG}   (No structure videos - I2V mode)`);
  }

  // SECTION 4: MODEL & SETTINGS
  console.log(`\n${TAG} MODEL & SETTINGS`);
  console.log(sectionDivider);
  console.log(`${TAG}   Model: ${orchDetails?.model_name || segmentParams?.model_name || '(unknown)'}`);
  console.log(`${TAG}   Model Type: ${orchDetails?.model_type || segmentParams?.model_type || 'i2v'}`);
  console.log(`${TAG}   Seed: ${orchDetails?.seed_base || segmentParams?.seed || '(random)'}`);
  console.log(`${TAG}   Amount of Motion: ${orchDetails?.amount_of_motion !== undefined ? Math.round(orchDetails.amount_of_motion * 100) + '%' : '(default)'}`);
  console.log(`${TAG}   Advanced Mode: ${orchDetails?.advanced_mode || false}`);
  console.log(`${TAG}   Turbo Mode: ${orchDetails?.turbo_mode || false}`);
  console.log(`${TAG}   Enhance Prompt: ${orchDetails?.enhance_prompt || false}`);

  const additionalLoras = orchDetails?.additional_loras;
  const phaseConfig = orchDetails?.phase_config;
  if (additionalLoras && Object.keys(additionalLoras).length > 0) {
    console.log(`${TAG}   LoRAs: ${Object.keys(additionalLoras).length} configured`);
    Object.entries(additionalLoras).forEach(([path, strength]) => {
      const pathShort = path.split('/').pop() || path;
      console.log(`${TAG}     - ${pathShort}: ${strength}`);
    });
  } else if (phaseConfig?.phases) {
    const uniqueLoras = new Set<string>();
    phaseConfig.phases.forEach((phase: any) => {
      phase.loras?.forEach((lora: any) => uniqueLoras.add(lora.url?.split('/').pop() || 'unknown'));
    });
    if (uniqueLoras.size > 0) {
      console.log(`${TAG}   LoRAs (in phase_config): ${uniqueLoras.size} unique`);
    }
  } else {
    console.log(`${TAG}   LoRAs: (none)`);
  }

  // SECTION 5: ORCHESTRATOR CONTEXT
  console.log(`\n${TAG} ORCHESTRATOR CONTEXT`);
  console.log(sectionDivider);
  console.log(`${TAG}   Total Segments: ${orchDetails?.num_new_segments_to_generate || '(unknown)'}`);
  console.log(`${TAG}   Total Images: ${inputImages.length}`);
  console.log(`${TAG}   Generation Mode: ${orchDetails?.generation_mode || 'batch'}`);
  console.log(`${TAG}   Generation Name: ${orchDetails?.generation_name || '(unnamed)'}`);
  console.log(`${TAG}   Resolution: ${orchDetails?.parsed_resolution_wh || '(auto)'}`);

  if (segmentFramesExpanded.length > 0) {
    console.log(`${TAG}   All Segment Frames: [${segmentFramesExpanded.join(', ')}]`);
    const totalFrames = segmentFramesExpanded.reduce((a: number, b: number) => a + b, 0);
    console.log(`${TAG}   Total Duration: ${totalFrames} frames (~${(totalFrames / 24).toFixed(1)}s)`);
  }

  console.log(`\n${divider}\n`);
}

/**
 * Extract segment-specific params from expanded arrays in orchestrator_details.
 * For travel segments, each segment can have different prompts, frame counts, etc.
 */
function extractSegmentSpecificParams(
  params: any,
  orchDetails: any,
  segmentIndex: number
): any {
  const specificParams = { ...params };

  const specificPrompt = extractFromArray(orchDetails.base_prompts_expanded, segmentIndex);
  if (specificPrompt !== undefined) {
    specificParams.prompt = specificPrompt;
    console.log(`[GenMigration] Set child prompt: "${String(specificPrompt).substring(0, 20)}..."`);
  }

  const specificNegativePrompt = extractFromArray(orchDetails.negative_prompts_expanded, segmentIndex);
  if (specificNegativePrompt !== undefined) {
    specificParams.negative_prompt = specificNegativePrompt;
  }

  const specificFrames = extractFromArray(orchDetails.segment_frames_expanded, segmentIndex);
  if (specificFrames !== undefined) {
    specificParams.num_frames = specificFrames;
  }

  const specificOverlap = extractFromArray(orchDetails.frame_overlap_expanded, segmentIndex);
  if (specificOverlap !== undefined) {
    specificParams.frame_overlap = specificOverlap;
  }

  const pairShotGenId = extractFromArray(orchDetails.pair_shot_generation_ids, segmentIndex);
  if (pairShotGenId !== undefined) {
    specificParams.pair_shot_generation_id = pairShotGenId;
    console.log(`[GenMigration] Set pair_shot_generation_id: ${pairShotGenId}`);
  }

  const startImageGenId = extractFromArray(orchDetails.input_image_generation_ids, segmentIndex);
  if (startImageGenId !== undefined) {
    specificParams.start_image_generation_id = startImageGenId;
  }
  const endImageGenId = extractFromArray(orchDetails.input_image_generation_ids, segmentIndex + 1);
  if (endImageGenId !== undefined) {
    specificParams.end_image_generation_id = endImageGenId;
  }

  return specificParams;
}
