import { createTask } from '../taskCreation';
import type { HiresFixApiParams } from './imageGeneration';

export interface CreateAnnotatedImageEditTaskParams {
  project_id: string;
  image_url: string;
  mask_url: string;
  prompt: string;
  num_generations: number;
  generation_id?: string;
  shot_id?: string;
  tool_type?: string;
  loras?: Array<{ url: string; strength: number }>;
  create_as_generation?: boolean; // If true, create a new generation instead of a variant
  source_variant_id?: string; // Track which variant was the source if editing from a variant
  // Advanced hires fix settings
  hires_fix?: HiresFixApiParams;
  // Qwen edit model selection (e.g., 'qwen-edit', 'qwen-edit-2509', 'qwen-edit-2511')
  qwen_edit_model?: string;
}

/**
 * Creates a single annotated image edit task via the unified edge function
 */
async function createSingleAnnotatedEditTask(params: Omit<CreateAnnotatedImageEditTaskParams, 'num_generations'>): Promise<string> {
  const {
    project_id,
    image_url,
    mask_url,
    prompt,
    generation_id,
    shot_id,
    tool_type,
    loras,
    create_as_generation,
    source_variant_id,
    hires_fix,
    qwen_edit_model,
  } = params;

  // Build hires fix params if provided
  const hiresFixParams: Record<string, unknown> = {};
  if (hires_fix) {
    if (hires_fix.hires_scale !== undefined) hiresFixParams.hires_scale = hires_fix.hires_scale;
    if (hires_fix.hires_steps !== undefined) hiresFixParams.hires_steps = hires_fix.hires_steps;
    if (hires_fix.hires_denoise !== undefined) hiresFixParams.hires_denoise = hires_fix.hires_denoise;
    if (hires_fix.lightning_lora_strength_phase_1 !== undefined) hiresFixParams.lightning_lora_strength_phase_1 = hires_fix.lightning_lora_strength_phase_1;
    if (hires_fix.lightning_lora_strength_phase_2 !== undefined) hiresFixParams.lightning_lora_strength_phase_2 = hires_fix.lightning_lora_strength_phase_2;
    if (hires_fix.additional_loras && Object.keys(hires_fix.additional_loras).length > 0) hiresFixParams.additional_loras = hires_fix.additional_loras;
  }

  const taskParams = {
    image_url,
    mask_url,
    prompt,
    num_generations: 1, // Each task creates one generation
    generation_id,
    based_on: generation_id, // Explicitly track source generation for lineage
    ...(shot_id ? { shot_id } : {}),
    ...(tool_type ? { tool_type } : {}),
    ...(loras && loras.length > 0 ? { loras } : {}),
    ...(create_as_generation ? { create_as_generation: true } : {}),
    ...(source_variant_id ? { source_variant_id } : {}),
    ...hiresFixParams,
    ...(qwen_edit_model ? { qwen_edit_model } : {}),
  };

  const result = await createTask({
    project_id,
    task_type: 'annotated_image_edit',
    params: taskParams,
  });

  return result.task_id;
}

/**
 * Creates annotated image edit tasks
 * Creates multiple tasks if num_generations > 1, using parallel execution
 * Similar to inpainting but for annotation-based edits
 *
 * @param params - Task parameters
 * @returns First task ID (for backward compatibility)
 */
export async function createAnnotatedImageEditTask(params: CreateAnnotatedImageEditTaskParams): Promise<string> {
  const { num_generations, ...singleTaskParams } = params;

  console.log('[AnnotatedImageEdit] Creating annotated image edit tasks:', {
    project_id: params.project_id.substring(0, 8),
    image_url: params.image_url.substring(0, 60),
    mask_url: params.mask_url.substring(0, 60),
    prompt: params.prompt.substring(0, 50),
    num_generations,
    generation_id: params.generation_id?.substring(0, 8),
    shot_id: params.shot_id?.substring(0, 8),
    tool_type: params.tool_type,
  });

  console.log('[AnnotatedImageEdit] 🔍 Detailed params check:', {
    has_shot_id: !!params.shot_id,
    shot_id_value: params.shot_id,
    has_tool_type: !!params.tool_type,
    tool_type_value: params.tool_type
  });

  // For single generation, create one task directly
  if (num_generations === 1) {
    const taskId = await createSingleAnnotatedEditTask(singleTaskParams);
    console.log('[AnnotatedImageEdit] ✅ Annotated image edit task created successfully:', {
      count: 1,
      taskIds: [taskId.substring(0, 8)],
    });
    return taskId;
  }

  // For multiple generations, create tasks in parallel
  console.log(`[AnnotatedImageEdit] Creating ${num_generations} tasks in parallel`);

  const results = await Promise.allSettled(
    Array.from({ length: num_generations }, () => createSingleAnnotatedEditTask(singleTaskParams))
  );

  // Process results
  const successful = results.filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled');
  const failed = results.filter(r => r.status === 'rejected');

  console.log(`[AnnotatedImageEdit] Batch results: ${successful.length} successful, ${failed.length} failed`);

  // If all failed, throw the first error
  if (successful.length === 0) {
    const firstError = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    throw new Error(`All annotated image edit tasks failed: ${firstError.reason}`);
  }

  // If some failed, log warnings
  if (failed.length > 0) {
    console.warn(`[AnnotatedImageEdit] ${failed.length} out of ${num_generations} tasks failed`);
    failed.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`[AnnotatedImageEdit] Task ${index + 1} failed:`, result.reason);
      }
    });
  }

  const taskIds = successful.map(r => r.value);
  console.log('[AnnotatedImageEdit] ✅ Annotated image edit tasks created successfully:', {
    count: taskIds.length,
    taskIds: taskIds.map(id => id.substring(0, 8)),
  });

  return taskIds[0]; // Return first task ID for compatibility
}
