/**
 * Variant creation handler
 * All variant behavior is determined by task params:
 * - based_on: which generation to create variant on
 * - is_primary: whether this becomes the main variant (default false)
 * - variant_type: label for the variant (from task_types table)
 */

import { createVariant } from './generation-core.ts';

/**
 * Create variant on source generation
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
  const variantType = taskData.variant_type || 'edit';

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
