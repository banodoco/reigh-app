import { createMaskedEditTask } from './maskedEditTaskBuilder';
import type { MaskedEditTaskParams } from './maskedEditTaskBuilder';

export type CreateAnnotatedImageEditTaskParams = MaskedEditTaskParams;

/**
 * Creates annotated image edit tasks
 * First task ID is returned for backward compatibility.
 */
export async function createAnnotatedImageEditTask(params: CreateAnnotatedImageEditTaskParams): Promise<string> {
  return createMaskedEditTask({
    taskType: 'annotated_image_edit',
    context: 'createAnnotatedImageEditTask',
    batchOperationName: 'AnnotatedImageEdit',
  }, params);
}
