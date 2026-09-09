import type { BatchImageGenerationTaskParams } from '@/shared/types/imageGeneration';
import { TaskValidationError, type TaskCreationResult } from './types';
import { createTask, resolveTaskCapability } from './createTask';

export const IMAGE_GENERATION_CAPABILITY_ID = 'generation.generate_image';

const SUPPORTED_MODELS = new Set(['z-image', 'qwen-image-2512']);
// The registered Astrid capability is currently the cloud/provider route.
// Keep local and Codex execution fail-closed until they have distinct catalog
// identities and readiness contracts.
const SUPPORTED_EXECUTIONS = new Set(['cloud']);
const MAX_IMAGES_PER_TASK = 16;
const MAX_IMAGE_DIMENSION = 16_384;
const MAX_SEED = 2_147_483_647;
const MAX_STEPS = 1_000;

export interface CompiledImageGenerationParams {
  model: string;
  mode: 't2i';
  execution: 'local' | 'cloud' | 'codex';
  prompt: string;
  count: number;
  seed?: number;
  steps?: number;
  size?: string;
}

function requireInteger(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new TaskValidationError(`${field} must be an integer from ${min} through ${max}`, field);
  }
  return value;
}

function requireOptionalInteger(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number | undefined {
  return value === undefined ? undefined : requireInteger(value, field, min, max);
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
  const count = requireInteger(params.imagesPerPrompt, 'imagesPerPrompt', 1, MAX_IMAGES_PER_TASK);
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
  const unsupportedControls = [
    ['shot_id', 'shot lineage'],
    ['negative_prompt', 'negative prompts'],
    ['resolution_scale', 'resolution scaling'],
    ['resolution_mode', 'resolution mode'],
    ['custom_aspect_ratio', 'custom aspect ratio'],
    ['num_inference_steps', 'inference-step alias'],
    ['hires_scale', 'hires scaling'],
    ['hires_steps', 'hires steps'],
    ['hires_denoise', 'hires denoise'],
    ['lightning_lora_strength_phase_1', 'phase-one LoRA strength'],
    ['lightning_lora_strength_phase_2', 'phase-two LoRA strength'],
    ['additional_loras', 'additional LoRAs'],
    ['style_reference_strength', 'reference strength'],
    ['subject_strength', 'reference strength'],
    ['in_this_scene_strength', 'reference strength'],
  ] as const;
  const unsupportedControl = unsupportedControls.find(([key]) => params[key] !== undefined);
  if (unsupportedControl) {
    throw new TaskValidationError(
      `${unsupportedControl[1]} are not part of the typed text-image route`,
      unsupportedControl[0],
    );
  }
  const seed = requireOptionalInteger(params.seed, 'seed', 0, MAX_SEED);
  const steps = requireOptionalInteger(params.steps, 'steps', 1, MAX_STEPS);
  if (params.resolution === undefined) {
    throw new TaskValidationError('An authoritative image resolution is required', 'resolution');
  }
  const resolutionMatch = /^(\d+)x(\d+)$/.exec(params.resolution.trim());
  const width = resolutionMatch === null ? NaN : Number(resolutionMatch[1]);
  const height = resolutionMatch === null ? NaN : Number(resolutionMatch[2]);
  if (
    resolutionMatch === null
    || !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width < 1
    || height < 1
    || width > MAX_IMAGE_DIMENSION
    || height > MAX_IMAGE_DIMENSION
  ) {
    throw new TaskValidationError('resolution must use positive WIDTHxHEIGHT pixels', 'resolution');
  }
  const size = params.resolution.trim();

  return params.prompts.map((entry) => {
    const prompt = entry.fullPrompt.trim();
    if (!prompt) throw new TaskValidationError('Image prompt must be non-empty', 'prompts');
    return {
      model,
      mode: 't2i',
      execution,
      prompt,
      count,
      ...(seed !== undefined ? { seed } : {}),
      ...(steps !== undefined ? { steps } : {}),
      size,
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
