import { createMaskedEditTask } from './maskedEditTaskBuilder';
import type { MaskedEditTaskParams } from './maskedEditTaskBuilder';

export type CreateImageInpaintTaskParams = MaskedEditTaskParams;

/**
 * Creates image inpainting tasks
 * First task ID is returned for backward compatibility.
 */
export async function createImageInpaintTask(params: CreateImageInpaintTaskParams): Promise<string> {
  return createMaskedEditTask({
    taskType: 'image_inpaint',
    context: 'createImageInpaintTask',
    batchOperationName: 'ImageInpaint',
  }, params);
}
