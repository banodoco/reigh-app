import { validateRequiredFields, TaskValidationError } from '../taskCreation';
import type { TaskCreationResult } from '../taskCreation';
import { runTaskCreationPipeline } from './taskCreatorPipeline';
import { composeTaskRequest } from './taskRequestComposer';

/**
 * Parameters for creating an image upscale task
 */
interface ImageUpscaleTaskParams {
  project_id: string;
  image_url: string; // The source image to upscale
  generation_id?: string | null; // Optional: the generation ID to update with upscaled URL
  source_variant_id?: string; // Optional: track which variant was the source for lineage
  scale_factor?: number; // Default to 2x upscaling
  noise_scale?: number; // Default to 0.1
  output_format?: string; // Default to "jpeg"
  shot_id?: string; // Optional: associate with shot for navigation from TasksPane
}

/**
 * Validates image upscale task parameters
 * @param params - Parameters to validate
 * @throws TaskValidationError if validation fails
 */
function validateImageUpscaleParams(params: ImageUpscaleTaskParams): void {
  validateRequiredFields(params, ['project_id', 'image_url']);

  if (params.image_url.trim() === '') {
    throw new TaskValidationError('Image URL cannot be empty', 'image_url');
  }

  // Validate URL format
  try {
    new URL(params.image_url);
  } catch {
    throw new TaskValidationError('Image URL must be a valid URL', 'image_url');
  }

  if (params.scale_factor !== undefined && (params.scale_factor < 1 || params.scale_factor > 8)) {
    throw new TaskValidationError('Scale factor must be between 1 and 8', 'scale_factor');
  }
}

/**
 * Builds the task params for an image-upscale task
 */
function buildImageUpscaleTaskParams(
  params: ImageUpscaleTaskParams
): Record<string, unknown> {
  const taskParams: Record<string, unknown> = {
    image: params.image_url,
    scale_factor: params.scale_factor ?? 2,
    noise_scale: params.noise_scale ?? 0.1,
    output_format: params.output_format ?? "jpeg",
  };

  // Add generation_id to task params so the worker knows which generation to update
  // Also add based_on for lineage tracking (same as inpaint and other edit tasks)
  // is_primary=true makes the upscaled version the main display variant
  if (params.generation_id) {
    taskParams.generation_id = params.generation_id;
    taskParams.based_on = params.generation_id;
    taskParams.is_primary = true;
  }

  // Track source variant if enhancing from a specific variant
  if (params.source_variant_id) {
    taskParams.source_variant_id = params.source_variant_id;
  }

  if (params.shot_id) {
    taskParams.shot_id = params.shot_id;
  }

  return taskParams;
}

/**
 * Creates an image upscale task
 * 
 * @param params - Image upscale task parameters
 * @returns Promise resolving to the created task
 */
export async function createImageUpscaleTask(params: ImageUpscaleTaskParams): Promise<TaskCreationResult> {
  return runTaskCreationPipeline({
    params,
    context: 'createImageUpscaleTask',
    validate: validateImageUpscaleParams,
    buildTaskRequest: (pipelineParams) => composeTaskRequest({
      source: pipelineParams,
      taskType: 'image-upscale',
      params: buildImageUpscaleTaskParams(pipelineParams),
    }),
  });
}
