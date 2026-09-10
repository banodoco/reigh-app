import {
  createTask,
  ingestProjectInputFromUrl,
  resolveTaskCapability,
} from '@/shared/lib/taskCreation';
import { TaskValidationError, type TaskCreationResult } from '@/shared/lib/taskCreation/types';
import type { MaskedEditTaskParams } from './buildMaskedEditTaskParams';

type CreateImageInpaintTaskParams = MaskedEditTaskParams;

export const IMAGE_EDIT_CAPABILITY_ID = 'generation.generate_image_edit';
const SOURCE_MAX_BYTES = 512_000;
const BOUNDED_EDIT_SIZE = '1024x1024';
const SUPPORTED_QWEN_UI_MODEL = 'qwen-edit-2511';
// The only admitted UI alias is intentionally mapped to the exact Astrid
// catalog identity; other Qwen/Klein aliases remain blocked before CAS.
const ASTRID_MODEL_BY_UI_ALIAS: Record<typeof SUPPORTED_QWEN_UI_MODEL, 'qwen-image-edit-2511'> = {
  [SUPPORTED_QWEN_UI_MODEL]: 'qwen-image-edit-2511',
};

export interface BoundedImageEditTaskOptions {
  sourceUrl: string;
  prompt: string;
  count: number;
  qwenEditModel: string;
  basedOn?: string;
  sourceVariantId?: string | null;
}

/** Admit the currently published source-only Qwen edit profile. */
export async function createBoundedImageEditTask(
  project: string,
  options: BoundedImageEditTaskOptions,
): Promise<TaskCreationResult> {
  if (options.qwenEditModel !== SUPPORTED_QWEN_UI_MODEL) {
    throw new TaskValidationError(
      `Qwen edit model ${options.qwenEditModel} is not represented by the published Astrid edit capability`,
      'qwenEditModel',
    );
  }
  if (!options.prompt.trim()) {
    throw new TaskValidationError('Image edit prompt must be non-empty', 'prompt');
  }
  if (options.count !== 1) {
    throw new TaskValidationError(
      'The published source-only Qwen edit profile admits exactly one output per task',
      'count',
    );
  }
  if (options.basedOn || options.sourceVariantId) {
    throw new TaskValidationError(
      'Runtime does not yet expose an atomic generation/variant lineage effect for typed edit tasks',
      'lineage',
    );
  }

  const capability = await resolveTaskCapability(project, IMAGE_EDIT_CAPABILITY_ID);
  if (capability.estimated_scratch_bytes <= 0 || capability.estimated_output_bytes <= 0) {
    throw new TaskValidationError(
      'Astrid edit capability has no nonzero storage estimate; producer admission is blocked',
      'storage_estimate',
    );
  }
  const source = await ingestProjectInputFromUrl(project, options.sourceUrl, {
    maxBytes: SOURCE_MAX_BYTES,
  });
  if (!source.media_type.startsWith('image/')) {
    throw new TaskValidationError('Image edit source must be an image media type', 'sourceUrl');
  }

  const result = await createTask({
    project,
    capability_id: IMAGE_EDIT_CAPABILITY_ID,
    capability_digest: capability.definition_digest,
    schema_version: '1',
    input_object_ids: [source.object_id],
    spec: {
      family: IMAGE_EDIT_CAPABILITY_ID,
      params: {
        model: ASTRID_MODEL_BY_UI_ALIAS[SUPPORTED_QWEN_UI_MODEL],
        mode: 'edit',
        execution: 'cloud',
        prompt: options.prompt.trim(),
        count: 1,
        size: BOUNDED_EDIT_SIZE,
        image_ref: {
          digest: source.object_id,
          filename: source.filename,
          media_type: source.media_type,
        },
      },
      output_policy: {},
    },
    storage_estimate: {
      scratch_bytes: capability.estimated_scratch_bytes,
      output_bytes: capability.estimated_output_bytes,
    },
    settlement_effect: {},
  });
  return result;
}

export function createImageInpaintTask(
  _params: CreateImageInpaintTaskParams,
): Promise<string> {
  return Promise.reject(new TaskValidationError(
    'Masked image edits are blocked until Astrid publishes a bounded mask-capable edit capability',
    'capability_id',
  ));
}
