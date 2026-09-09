import type { BatchImageGenerationTaskParams } from '@/shared/types/imageGeneration';
import { TaskValidationError, type TaskCreationResult } from './types';
import { createTask, resolveTaskCapability } from './createTask';

export const IMAGE_GENERATION_CAPABILITY_ID = 'generation.generate_image';

const SUPPORTED_MODELS = new Set(['z-image', 'qwen-image-2512']);
// The registered Astrid capability is currently the cloud/provider route.
// Keep local and Codex execution fail-closed until they have distinct catalog
// identities and readiness contracts.
const SUPPORTED_EXECUTIONS = new Set(['cloud']);

export interface CompiledImageGenerationParams {
  model: string;
  mode: 't2i';
  execution: 'local' | 'cloud' | 'codex';
  prompt: string;
  count: number;
  seed?: number;
  steps?: number;
}

function requirePositiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new TaskValidationError(`${field} must be a positive integer`, field);
  }
  return value;
}

/** Compile one text-only UI prompt into the registered Astrid executor schema. */
export function compileImageGenerationParams(
  params: BatchImageGenerationTaskParams,
): CompiledImageGenerationParams[] {
  const model = params.model_name;
  if (!model || !SUPPORTED_MODELS.has(model)) {
    throw new TaskValidationError(
      `Image model ${model ?? '(missing)'} is not registered by Astrid; supported models: z-image, qwen-image-2512`,
      'model_name',
    );
  }
  const execution = params.execution;
  if (!execution || !SUPPORTED_EXECUTIONS.has(execution)) {
    throw new TaskValidationError('The registered Astrid image route currently supports cloud execution only', 'execution');
  }
  if (params.imagesPerPrompt === undefined) {
    throw new TaskValidationError('imagesPerPrompt is required', 'imagesPerPrompt');
  }
  const count = requirePositiveInteger(params.imagesPerPrompt, 'imagesPerPrompt');
  if (!Array.isArray(params.prompts) || params.prompts.length === 0) {
    throw new TaskValidationError('At least one image prompt is required', 'prompts');
  }
  if (params.prompts.length !== 1) {
    throw new TaskValidationError(
      'The registered Astrid image route currently admits one prompt per task; batch fan-out is not yet atomic',
      'prompts',
    );
  }

  const unsupportedMedia = [
    'style_reference_image',
    'subject_reference_image',
    'in_this_scene',
    'subject_description',
    'reference_mode',
  ] as const;
  if (unsupportedMedia.some((key) => params[key] !== undefined)) {
    throw new TaskValidationError(
      'Text-only image admission cannot carry reference media; use the B03-T05b i2i route',
      'input_object_ids',
    );
  }
  if (params.loras && params.loras.length > 0) {
    throw new TaskValidationError('LoRA controls are not yet part of the typed text-image route', 'loras');
  }
  if (params.resolution_scale !== undefined || params.resolution_mode !== undefined || params.custom_aspect_ratio !== undefined) {
    throw new TaskValidationError('Resolution scaling is not yet part of the typed text-image route', 'resolution');
  }

  return params.prompts.map((entry) => {
    const prompt = entry.fullPrompt.trim();
    if (!prompt) throw new TaskValidationError('Image prompt must be non-empty', 'prompts');
    return {
      model,
      mode: 't2i',
      execution,
      prompt,
      count,
      ...(params.seed !== undefined ? { seed: params.seed } : {}),
      ...(params.steps !== undefined ? { steps: params.steps } : {}),
    };
  });
}

/** Admit one prompt as one canonical task until batch admission is atomic. */
export async function createImageGenerationTasks(
  project: string,
  params: BatchImageGenerationTaskParams,
): Promise<TaskCreationResult> {
  const compiled = compileImageGenerationParams(params);
  const capability = await resolveTaskCapability(project, IMAGE_GENERATION_CAPABILITY_ID);
  if (capability.estimated_scratch_bytes <= 0 || capability.estimated_output_bytes <= 0) {
    throw new TaskValidationError(
      'Astrid image capability has no nonzero storage estimate; producer admission is blocked',
      'storage_estimate',
    );
  }
  const spec = compiled[0];
  if (!spec) throw new TaskValidationError('Image generation request compiled to no task', 'prompts');
  const result = await createTask({
    project,
    capability_id: IMAGE_GENERATION_CAPABILITY_ID,
    capability_digest: capability.definition_digest,
    schema_version: '1',
    input_object_ids: [],
    spec: {
      family: IMAGE_GENERATION_CAPABILITY_ID,
      params: spec,
      output_policy: {},
    },
    storage_estimate: {
      scratch_bytes: capability.estimated_scratch_bytes,
      output_bytes: capability.estimated_output_bytes * spec.count,
    },
    settlement_effect: {},
  });
  const taskIds = result.task_ids ?? [result.task_id];
  return {
    task_id: taskIds[0] ?? '',
    task_ids: taskIds,
    status: result.status ?? 'Queued',
  };
}
