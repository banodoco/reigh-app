import {
  createTask,
  validateRequiredFields,
  TaskValidationError,
  BaseTaskParams,
} from '../taskCreation';
import type { TaskCreationResult } from '../taskCreation';
import { handleError } from '@/shared/lib/errorHandler';

/**
 * Parameters for creating an image upscale task
 */
export interface ImageUpscaleTaskParams {
  project_id: string;
  image_url: string; // The source image to upscale
  generation_id?: string | null; // Optional: the generation ID to update with upscaled URL
  shot_id?: string; // Optional: shot to link the result to
  scale_factor?: number; // Default to 2x upscaling
  noise_scale?: number; // Default to 0.1
  output_format?: string; // Default to "jpeg"
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

  // Add shot_id if provided (for linking result to shot)
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
  console.log("[createImageUpscaleTask] Creating task with params:", params);

  try {
    // 1. Validate parameters
    validateImageUpscaleParams(params);

    // 2. Build task params in the image-upscale format
    const taskParams = buildImageUpscaleTaskParams(params);

    // 3. Create task using unified create-task function
    const result = await createTask({
      project_id: params.project_id,
      task_type: "image-upscale",
      params: taskParams,
    });

    console.log("[createImageUpscaleTask] Task created successfully:", result);
    return result;

  } catch (error) {
    handleError(error, { context: 'ImageUpscale', showToast: false });
    throw error;
  }
}

