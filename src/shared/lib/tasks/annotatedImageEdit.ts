import { createTask, buildHiresFixParams } from '../taskCreation';
import type { HiresFixApiParams } from '../taskCreation';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { ComfyLoraConfig } from '@/shared/types/lora';

interface CreateAnnotatedImageEditTaskParams {
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

  const taskParams = {
    image_url,
    mask_url,
    prompt,
    num_generations: 1, // Each task creates one generation
    generation_id,
    based_on: generation_id, // Explicitly track source generation for lineage
    parent_generation_id: generation_id, // Compatibility for workers that key off parent_generation_id
    ...(shot_id ? { shot_id } : {}),
    ...(tool_type ? { tool_type } : {}),
    ...(loras && loras.length > 0 ? { loras } : {}),
    ...(create_as_generation ? { create_as_generation: true } : {}),
    ...(source_variant_id ? { source_variant_id } : {}),
    ...buildHiresFixParams(hires_fix),
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

  // For single generation, create one task directly
  if (num_generations === 1) {
    const taskId = await createSingleAnnotatedEditTask(singleTaskParams);
    return taskId;
  }

  // For multiple generations, create tasks in parallel

  const results = await Promise.allSettled(
    Array.from({ length: num_generations }, () => createSingleAnnotatedEditTask(singleTaskParams))
  );

  // Process results
  const successful = results.filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled');
  const failed = results.filter(r => r.status === 'rejected');

  // If all failed, throw the first error
  if (successful.length === 0) {
    const firstError = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    throw new Error(`All annotated image edit tasks failed: ${firstError.reason}`);
  }

  // If some failed, log warnings
  if (failed.length > 0) {
    failed.forEach((result, index) => {
      if (result.status === 'rejected') {
        normalizeAndPresentError(result.reason, { context: `AnnotatedImageEdit:task${index + 1}`, showToast: false });
      }
    });
  }

  const taskIds = successful.map(r => r.value);

  return taskIds[0]; // Return first task ID for compatibility
}
