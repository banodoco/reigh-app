import {
  validateRequiredFields,
  TaskValidationError,
  validateNonEmptyString,
  validateUrlString,
  validateNumericRange,
  validateSeed32Bit,
  validateLoraConfigs,
  setTaskLineageFields,
} from '../taskCreation';
import type { TaskCreationResult } from '../taskCreation';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { FalLoraConfig } from '@/shared/types/lora';
import { runBatchTaskPipeline } from './batchTaskPipeline';
import { runTaskCreationPipeline } from './taskCreatorPipeline';
import { composeTaskRequest } from './taskRequestComposer';

/**
 * Parameters for creating a Z Image Turbo image-to-image task
 * Maps to fal-ai/z-image/turbo/image-to-image endpoint
 */
interface ZImageTurboImageToImageTaskParams {
  project_id: string;
  image_url: string;           // Source image URL (required)
  prompt?: string;             // Text prompt (default "")
  strength?: number;           // Transform strength 0-1 (default 0.6)
  enable_prompt_expansion?: boolean; // Enable AI prompt expansion (default false)
  seed?: number;               // Random seed (optional)
  numImages?: number;          // Number of outputs (default 1, max 4)
  loras?: FalLoraConfig[];  // LoRAs (triggers /lora endpoint if provided)
  shot_id?: string;            // Associate with shot
  based_on?: string;           // Source generation ID for lineage
  source_variant_id?: string;  // Source variant ID
  create_as_generation?: boolean; // Create as new generation vs variant
  tool_type?: string;          // Override tool type
}

/**
 * Parameters for batch Z Image Turbo image-to-image task creation
 */
interface BatchZImageTurboImageToImageTaskParams {
  project_id: string;
  image_url: string;
  prompt?: string;
  strength?: number;
  enable_prompt_expansion?: boolean;
  seed?: number;
  numImages: number;           // How many variations to generate (creates multiple tasks)
  loras?: FalLoraConfig[];
  shot_id?: string;
  based_on?: string;
  source_variant_id?: string;
  create_as_generation?: boolean;
  tool_type?: string;
}

/**
 * Validates Z Image Turbo image-to-image task parameters
 */
function validateZImageTurboImageToImageParams(params: ZImageTurboImageToImageTaskParams): void {
  validateRequiredFields(params, ['project_id', 'image_url']);

  validateNonEmptyString(params.image_url, 'image_url', 'Image URL');
  validateUrlString(params.image_url, 'image_url', 'Image URL');
  validateNumericRange(params.strength, {
    field: 'strength',
    label: 'Strength',
    min: 0,
    max: 1,
  });
  validateNumericRange(params.numImages, {
    field: 'numImages',
    label: 'Number of images',
    min: 1,
    max: 4,
  });
  validateSeed32Bit(params.seed);
  validateLoraConfigs(
    params.loras?.map((lora) => ({ ...lora, scale: lora.scale ?? 1.0 })),
    {
    pathField: 'path',
    strengthField: 'scale',
    strengthLabel: 'scale',
    min: 0,
    max: 2,
    },
  );
}

/**
 * Validates batch parameters
 */
function validateBatchParams(params: BatchZImageTurboImageToImageTaskParams): void {
  validateRequiredFields(params, ['project_id', 'image_url', 'numImages']);

  if (params.numImages < 1 || params.numImages > 16) {
    throw new TaskValidationError('Number of images must be between 1 and 16', 'numImages');
  }

  // Validate the rest using single task validation
  validateZImageTurboImageToImageParams({
    project_id: params.project_id,
    image_url: params.image_url,
    prompt: params.prompt,
    strength: params.strength,
    loras: params.loras,
  });
}

/**
 * Builds task params in the format expected by the worker
 */
function buildTaskParams(params: ZImageTurboImageToImageTaskParams): Record<string, unknown> {
  const taskParams: Record<string, unknown> = {
    image_url: params.image_url,
    prompt: params.prompt ?? '',
    strength: params.strength ?? 0.6,
    enable_prompt_expansion: params.enable_prompt_expansion ?? false,
    num_images: params.numImages ?? 1,
    // API-specific params
    image_size: 'auto',
    num_inference_steps: 8,
    output_format: 'png',
    enable_safety_checker: true,
    add_in_position: false,
  };

  // Add seed if provided
  if (params.seed !== undefined) {
    taskParams.seed = params.seed;
  }

  // Add LoRAs if provided (transforms to API format)
  if (params.loras && params.loras.length > 0) {
    taskParams.loras = params.loras.map(lora => ({
      path: lora.path,
      scale: lora.scale ?? 1.0,
    }));
    // When using LoRAs, acceleration must be "none"
    taskParams.acceleration = 'none';
  } else {
    // Without LoRAs, use "high" acceleration
    taskParams.acceleration = 'high';
  }

  setTaskLineageFields(taskParams, {
    shotId: params.shot_id,
    basedOn: params.based_on,
    sourceVariantId: params.source_variant_id,
    createAsGeneration: params.create_as_generation,
    toolType: params.tool_type,
  });

  return taskParams;
}

/**
 * Creates a single Z Image Turbo image-to-image task
 * (internal use only - used by createBatchZImageTurboImageToImageTasks)
 */
async function createZImageTurboImageToImageTask(params: ZImageTurboImageToImageTaskParams): Promise<TaskCreationResult> {
  return runTaskCreationPipeline({
    params,
    context: 'createZImageTurboImageToImageTask',
    validate: validateZImageTurboImageToImageParams,
    buildTaskRequest: (pipelineParams) => composeTaskRequest({
      source: pipelineParams,
      taskType: 'z_image_turbo_i2i',
      params: buildTaskParams(pipelineParams),
    }),
  });
}

/**
 * Creates multiple Z Image Turbo image-to-image tasks in parallel (batch generation)
 */
export async function createBatchZImageTurboImageToImageTasks(
  params: BatchZImageTurboImageToImageTaskParams
): Promise<TaskCreationResult[]> {

  try {
    return await runBatchTaskPipeline({
      batchParams: params,
      validateBatchParams: validateBatchParams,
      buildSingleTaskParams: (batchParams): ZImageTurboImageToImageTaskParams[] => (
        Array.from({ length: batchParams.numImages }, (_, index) => {
          const seed = batchParams.seed ?? Math.floor(Math.random() * 0x7fffffff);

          return {
            project_id: batchParams.project_id,
            image_url: batchParams.image_url,
            prompt: batchParams.prompt,
            strength: batchParams.strength,
            enable_prompt_expansion: batchParams.enable_prompt_expansion,
            seed: seed + index,
            numImages: 1,
            loras: batchParams.loras,
            shot_id: batchParams.shot_id,
            based_on: batchParams.based_on,
            source_variant_id: batchParams.source_variant_id,
            create_as_generation: batchParams.create_as_generation,
            tool_type: batchParams.tool_type,
          } as ZImageTurboImageToImageTaskParams;
        })
      ),
      createSingleTask: createZImageTurboImageToImageTask,
      operationName: 'createBatchZImageTurboImageToImageTasks',
    });

  } catch (error) {
    normalizeAndPresentError(error, { context: 'BatchZImageTurboImageToImage', showToast: false });
    throw error;
  }
}

// TaskValidationError is used internally - import from taskCreation.ts if needed externally
