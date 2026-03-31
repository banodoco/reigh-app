/**
 * Child-generation helpers for segment-style complete_task routes.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { TASK_TYPES, VARIANT_TYPE_DEFAULT } from './constants.ts';
import { extractShotAndPosition, buildGenerationParams, resolveBasedOn } from './params.ts';
import { insertGeneration, createVariant, derivePredecessorVariantId } from './generation-core.ts';
import { createVariantOnParent, getChildVariantViewedAt } from './generation-parent.ts';
import { normalizeSegmentTaskParams } from './taskParamNormalizer.ts';
import { buildSegmentMasterStateSnapshot } from './generation-child-diagnostics.ts';
import type { CompletionLogger } from './types.ts';

export interface HandlerContext {
  supabase: SupabaseClient;
  taskId: string;
  taskData: unknown;
  publicUrl: string;
  thumbnailUrl: string | null;
  logger?: CompletionLogger;
  childGenerationId?: string;
  parentGenerationId?: string;
  childOrder?: number | null;
  isSingleItem?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export async function handleChildGeneration(ctx: HandlerContext): Promise<unknown | null> {
  const { supabase, taskId, taskData, publicUrl, thumbnailUrl, logger, parentGenerationId, childOrder, isSingleItem } = ctx;

  if (!parentGenerationId) {
    return null;
  }

  const finalChildOrder = childOrder ?? null;

  logger?.info("Creating child generation", {
    task_id: taskId,
    parent_generation_id: parentGenerationId,
    child_order: finalChildOrder,
    is_single_item: isSingleItem,
    task_type: taskData.task_type,
  });

  const normalized = normalizeSegmentTaskParams({
    taskData,
    childOrder: finalChildOrder,
    isSingleItem: Boolean(isSingleItem),
  });
  const normalizedCtx: HandlerContext = {
    ...ctx,
    taskData: normalized.taskData,
  };

  if (isSingleItem) {
    logger?.info("Single-item detected", {
      task_id: taskId,
      parent_generation_id: parentGenerationId,
    });

    await createSingleItemVariant(normalizedCtx, parentGenerationId);
  }

  const pairShotGenId = normalized.pairShotGenerationId;

  if (finalChildOrder !== null && !isNaN(finalChildOrder)) {
    const existingGenId = await findExistingGenerationAtPosition(
      supabase, parentGenerationId, finalChildOrder, pairShotGenId
    );

    if (existingGenId) {
      const variantViewedAt = await getChildVariantViewedAt(supabase, {
        taskParams: normalized.params,
        parentGenerationId,
      });

      logger?.info("Adding segment as variant to existing generation", {
        task_id: taskId,
        existing_generation_id: existingGenId,
        child_order: finalChildOrder,
      });

      const variantTypeForExisting = normalized.taskData.variant_type || VARIANT_TYPE_DEFAULT;
      const predecessorVariantId = await derivePredecessorVariantId(
        supabase,
        normalized.params,
        parentGenerationId,
        finalChildOrder,
      );

      const variantResult = await createVariantOnParent(
        supabase, existingGenId, publicUrl, thumbnailUrl, normalized.taskData, taskId,
        variantTypeForExisting,
        {
          tool_type: normalized.taskData.tool_type,
          created_from: 'segment_variant_at_position',
          segment_index: finalChildOrder,
          pair_shot_generation_id: pairShotGenId,
          ...(predecessorVariantId
            ? { continuation_predecessor_variant_id: predecessorVariantId }
            : {}),
        },
        null,
        false,
        variantViewedAt
      );

      if (variantResult) return variantResult;
      console.warn('Failed to create variant; falling through to new generation');
    }
  }

  return createChildGenerationRecord(
    normalizedCtx,
    parentGenerationId,
    finalChildOrder,
    isSingleItem || false,
    pairShotGenId,
  );
}

export async function createSingleItemVariant(
  ctx: HandlerContext,
  parentGenerationId: string
): Promise<unknown | null> {
  const { supabase, taskId, taskData, publicUrl, thumbnailUrl, childOrder } = ctx;
  const params = asRecord(taskData.params);

  // Check if this is first variant on parent
  const { count: existingVariantCount } = await supabase
    .from('generation_variants')
    .select('id', { count: 'exact', head: true })
    .eq('generation_id', parentGenerationId);
  const isFirstVariant = (existingVariantCount || 0) === 0;

  const toolType = asString(params.tool_type) ?? asString(taskData.tool_type);

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

// Note: (parent_generation_id, child_order) and (parent_generation_id, pair_shot_generation_id)
// are NOT unique - duplicates can arise from retries/re-runs. child_order is intra-run only;
// pair_shot_generation_id is the durable position key. We use order(created_at DESC)+limit(1)
// to deterministically pick the most recent row.
export async function findExistingGenerationAtPosition(
  supabase: SupabaseClient,
  parentGenerationId: string,
  childOrder: number,
  pairShotGenId?: string
): Promise<string | null> {

  if (pairShotGenId) {
    const { data: matchByColumn, error: matchByColumnError } = await supabase
      .from('generations')
      .select('id')
      .eq('parent_generation_id', parentGenerationId)
      .eq('is_child', true)
      .eq('pair_shot_generation_id', pairShotGenId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!matchByColumnError && matchByColumn?.id) {
      return matchByColumn.id;
    }

  }

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
      return matchByChildOrder.id;
    }
  }

  return null;
}

export async function createChildGenerationRecord(
  ctx: HandlerContext,
  parentGenerationId: string,
  childOrder: number | null,
  isSingleItemCase: boolean,
  pairShotGenerationId?: string | null | false
): Promise<unknown> {
  const { supabase, taskId, taskData, publicUrl, thumbnailUrl, logger } = ctx;
  const params = asRecord(taskData.params);

  const { shotId } = extractShotAndPosition(params);
  const generationType = taskData.content_type || 'video';
  const toolType = taskData.tool_type;
  let generationParams = buildGenerationParams(
    params, toolType, generationType, shotId, thumbnailUrl || undefined, taskId
  );

  if (pairShotGenerationId && !generationParams.pair_shot_generation_id) {
    generationParams = { ...generationParams, pair_shot_generation_id: pairShotGenerationId };
  }

  const predecessorVariantId = await derivePredecessorVariantId(
    supabase,
    generationParams,
    parentGenerationId,
    childOrder,
  );
  if (predecessorVariantId) {
    generationParams = {
      ...generationParams,
      continuation_predecessor_variant_id: predecessorVariantId,
    };
  }

  const newGenerationId = crypto.randomUUID();

  const generationName = asString(params.generation_name);

  // Find based_on
  const basedOnGenerationId = await resolveBasedOn(supabase, params);

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
      validatedPairShotGenId = null;
    }
  }

  const generationRecord: Record<string, unknown> = {
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

  // Build diagnostic snapshot for segment tasks without mixing it into write-path orchestration.
  const isTravelSegmentTask = taskData.task_type === TASK_TYPES.TRAVEL_SEGMENT ||
                               taskData.task_type === TASK_TYPES.INDIVIDUAL_TRAVEL_SEGMENT;
  const orchestratorDetails = asRecord(params.orchestrator_details);

  if (isTravelSegmentTask && childOrder !== null) {
    try {
      const segmentSnapshot = buildSegmentMasterStateSnapshot({
        taskId,
        generationId: newGeneration.id,
        segmentIndex: childOrder,
        parentGenerationId,
        orchestratorDetails,
        segmentParams: params,
        shotId,
      });
      logger?.debug('Segment master state', segmentSnapshot);
    } catch (logError) {
      logger?.warn('Failed to build segment master state', {
        taskId,
        generationId: newGeneration.id,
        segmentIndex: childOrder,
        error: logError,
      });
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

  await createVariant(
    supabase, newGeneration.id, publicUrl, thumbnailUrl,
    { ...generationParams, source_task_id: taskId, created_from: createdFrom },
    true, 'original', null, autoViewedAt
  );

  await supabase.from('tasks').update({ generation_created: true }).eq('id', taskId);

  return newGeneration;
}
