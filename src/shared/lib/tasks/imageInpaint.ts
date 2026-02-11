import { createTask } from '../taskCreation';
import { handleError } from '@/shared/lib/errorHandler';
import type { HiresFixApiParams } from './imageGeneration';

interface CreateImageInpaintTaskParams {
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
 * Creates a single image inpainting task via the unified edge function
 */
async function createSingleInpaintTask(params: Omit<CreateImageInpaintTaskParams, 'num_generations'>): Promise<string> {
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
    task_type: 'image_inpaint',
    params: taskParams,
  });

  return result.task_id;
}

/**
 * Creates image inpainting tasks
 * Creates multiple tasks if num_generations > 1, using parallel execution
 *
 * @param params - Task parameters
 * @returns First task ID (for backward compatibility)
 */
export async function createImageInpaintTask(params: CreateImageInpaintTaskParams): Promise<string> {
  const { num_generations, ...singleTaskParams } = params;

  // For single generation, create one task directly
  if (num_generations === 1) {
    const taskId = await createSingleInpaintTask(singleTaskParams);
    return taskId;
  }

  // For multiple generations, create tasks in parallel

  const results = await Promise.allSettled(
    Array.from({ length: num_generations }, () => createSingleInpaintTask(singleTaskParams))
  );

  // Process results
  const successful = results.filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled');
  const failed = results.filter(r => r.status === 'rejected');

  // If all failed, throw the first error
  if (successful.length === 0) {
    const firstError = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    throw new Error(`All inpaint tasks failed: ${firstError.reason}`);
  }

  // If some failed, log warnings
  if (failed.length > 0) {
    failed.forEach((result, index) => {
      if (result.status === 'rejected') {
        handleError(result.reason, { context: `ImageInpaint:task${index + 1}`, showToast: false });
      }
    });
  }

  const taskIds = successful.map(r => r.value);

  return taskIds[0]; // Return first task ID for compatibility
}
