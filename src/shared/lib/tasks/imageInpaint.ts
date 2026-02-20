import { createTask, processBatchResults, buildHiresFixParams } from '../taskCreation';
import type { TaskCreationResult, HiresFixApiParams } from '../taskCreation';
import type { ComfyLoraConfig } from '@/shared/types/lora';

interface CreateImageInpaintTaskParams {
  project_id: string;
  image_url: string;
  mask_url: string;
  prompt: string;
  num_generations: number;
  generation_id?: string;
  shot_id?: string;
  tool_type?: string;
  loras?: ComfyLoraConfig[];
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
function createSingleInpaintTask(params: Omit<CreateImageInpaintTaskParams, 'num_generations'>): Promise<TaskCreationResult> {
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
    ...buildHiresFixParams(hires_fix),
    ...(qwen_edit_model ? { qwen_edit_model } : {}),
  };

  return createTask({
    project_id,
    task_type: 'image_inpaint',
    params: taskParams,
  });
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
    const result = await createSingleInpaintTask(singleTaskParams);
    return result.task_id;
  }

  // For multiple generations, create tasks in parallel
  const results = await Promise.allSettled(
    Array.from({ length: num_generations }, () => createSingleInpaintTask(singleTaskParams))
  );

  const successful = processBatchResults(results, 'ImageInpaint');
  return successful[0].task_id; // Return first task ID for compatibility
}
