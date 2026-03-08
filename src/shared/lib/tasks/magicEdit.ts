import {
  resolveProjectResolution,
  resolveSeed32Bit,
  validateSeed32Bit,
  validateRequiredFields,
  TaskValidationError,
  buildHiresFixParams,
  validateNonEmptyString,
  validateUrlString,
  setTaskLineageFields,
} from '../taskCreation';
import type { TaskCreationResult } from '../taskCreation';
import type { HiresFixApiParams } from '../taskCreation';
import type { ComfyLoraConfig } from '@/domains/lora/types/lora';
import { runBatchTaskPipeline } from './batchTaskPipeline';
import { rethrowTaskCreationError } from './taskCreationError';
import { composeTaskRequest } from './taskRequestComposer';
import { runTaskCreationPipeline } from './taskCreatorPipeline';

/**
 * Parameters for creating a magic edit task
 * Maps to the parameters expected by the image_edit task type
 */
interface MagicEditTaskParams {
  project_id: string;
  prompt: string;
  image_url: string; // The source image to edit
  negative_prompt?: string;
  resolution?: string; // e.g., "512x512" - will be resolved from project if not provided
  seed?: number;
  in_scene?: boolean; // In-scene boost option
  shot_id?: string; // Optional: associate generated image with a shot
  output_format?: string; // Default to "jpeg"
  enable_sync_mode?: boolean; // Default to false
  max_wait_seconds?: number; // Default to 300
  enable_base64_output?: boolean; // Default to false
  tool_type?: string; // Optional: override tool type for generation association
  loras?: ComfyLoraConfig[]; // Optional: array of lora configurations for model enhancement
  based_on?: string; // Optional: source generation ID for lineage tracking
  source_variant_id?: string; // Optional: source variant ID when editing from a non-primary variant
  create_as_generation?: boolean; // Optional: if true, create a new generation instead of a variant
  // Advanced hires fix settings
  hires_fix?: HiresFixApiParams;
  // Model selection for cloud mode
  qwen_edit_model?: 'qwen-edit' | 'qwen-edit-2509' | 'qwen-edit-2511';
}

/**
 * Parameters for creating multiple magic edit tasks (batch generation)
 */
type BatchMagicEditTaskParams = MagicEditTaskParams & { numImages: number };

/**
 * Validates magic edit task parameters
 * @param params - Parameters to validate
 * @throws TaskValidationError if validation fails
 */
function validateMagicEditParams(params: MagicEditTaskParams): void {
  validateRequiredFields(params, ['project_id', 'prompt', 'image_url']);

  validateNonEmptyString(params.prompt, 'prompt', 'Prompt');
  validateNonEmptyString(params.image_url, 'image_url', 'Image URL');
  validateUrlString(params.image_url, 'image_url', 'Image URL');

  if (params.seed !== undefined) {
    try {
      validateSeed32Bit(params.seed, 'seed');
    } catch {
      throw new TaskValidationError('Seed must be a 32-bit positive integer', 'seed');
    }
  }

  if (params.max_wait_seconds !== undefined && params.max_wait_seconds < 1) {
    throw new TaskValidationError('Max wait seconds must be positive', 'max_wait_seconds');
  }
}

/**
 * Validates batch magic edit parameters
 * @param params - Parameters to validate
 * @throws TaskValidationError if validation fails
 */
function validateBatchMagicEditParams(params: BatchMagicEditTaskParams): void {
  validateRequiredFields(params, ['project_id', 'prompt', 'image_url', 'numImages']);

  // Validate numImages
  if (params.numImages < 1 || params.numImages > 16) {
    throw new TaskValidationError('Number of images must be between 1 and 16', 'numImages');
  }

  // Use single task validation for the rest
  validateMagicEditParams({
    project_id: params.project_id,
    prompt: params.prompt,
    image_url: params.image_url,
    negative_prompt: params.negative_prompt,
    resolution: params.resolution,
    seed: params.seed,
    in_scene: params.in_scene,
    shot_id: params.shot_id,
    output_format: params.output_format,
    enable_sync_mode: params.enable_sync_mode,
    max_wait_seconds: params.max_wait_seconds,
    enable_base64_output: params.enable_base64_output,
  });
}

/**
 * Builds the task params for an image_edit task
 * This follows the format from the example task you provided
 */
function buildMagicEditTaskParams(
  params: MagicEditTaskParams,
  finalResolution: string
): Record<string, unknown> {
  // Build the task params in the format expected by image_edit
  const taskParams: Record<string, unknown> = {
    seed: resolveSeed32Bit({ seed: params.seed, field: 'seed' }),
    image: params.image_url,
    prompt: params.prompt,
    output_format: params.output_format ?? "jpeg",
    qwen_edit_model: params.qwen_edit_model ?? 'qwen-edit',
    enable_sync_mode: params.enable_sync_mode ?? false,
    max_wait_seconds: params.max_wait_seconds ?? 300,
    enable_base64_output: params.enable_base64_output ?? false,
  };

  // Add optional parameters if provided
  if (params.negative_prompt) {
    taskParams.negative_prompt = params.negative_prompt;
  }

  if (params.in_scene !== undefined) {
    taskParams.in_scene = params.in_scene;
  }

  // Add resolution if needed (some edit models may use this)
  if (finalResolution && finalResolution !== "custom") {
    taskParams.resolution = finalResolution;
  }

  // Always add add_in_position as false for magic edit tasks (unpositioned by default)
  taskParams.add_in_position = false;

  // Add loras if provided
  if (params.loras && params.loras.length > 0) {
    taskParams.loras = params.loras;
  }

  setTaskLineageFields(taskParams, {
    shotId: params.shot_id,
    basedOn: params.based_on,
    sourceVariantId: params.source_variant_id,
    createAsGeneration: params.create_as_generation,
    toolType: params.tool_type,
  });

  // Add hires fix / inference params if provided
  Object.assign(taskParams, buildHiresFixParams(params.hires_fix));

  return taskParams;
}

/**
 * Creates a single magic edit task using the unified approach
 * This replaces the direct call to the magic-edit edge function
 * (internal use only - used by createBatchMagicEditTasks)
 *
 * @param params - Magic edit task parameters
 * @returns Promise resolving to the created task
 */
async function createMagicEditTask(params: MagicEditTaskParams): Promise<TaskCreationResult> {
  return runTaskCreationPipeline({
    params,
    context: 'MagicEdit',
    validate: validateMagicEditParams,
    buildTaskRequest: async (requestParams) => {
      const { resolution: finalResolution } = await resolveProjectResolution(
        requestParams.project_id,
        requestParams.resolution,
      );

      const taskParams = buildMagicEditTaskParams(requestParams, finalResolution);

      return composeTaskRequest({
        source: requestParams,
        taskType: "qwen_image_edit",
        params: taskParams,
      });
    },
  });
}

/**
 * Creates multiple magic edit tasks in parallel (batch generation)
 * Used by MediaLightbox unified edit mode for creating multiple variations
 * 
 * @param params - Batch magic edit parameters
 * @returns Promise resolving to array of created tasks
 */
export async function createBatchMagicEditTasks(params: BatchMagicEditTaskParams): Promise<TaskCreationResult[]> {

  try {
    return await runBatchTaskPipeline({
      batchParams: params,
      validateBatchParams: validateBatchMagicEditParams,
      buildSingleTaskParams: async (batchParams): Promise<MagicEditTaskParams[]> => {
        const { resolution: finalResolution } = await resolveProjectResolution(
          batchParams.project_id,
          batchParams.resolution,
        );

        return Array.from({ length: batchParams.numImages }, (_, index) => {
          const seedBase = resolveSeed32Bit({ seed: batchParams.seed, field: 'seed' });
          const seed = seedBase + index;

          return {
            project_id: batchParams.project_id,
            prompt: batchParams.prompt,
            image_url: batchParams.image_url,
            negative_prompt: batchParams.negative_prompt,
            resolution: finalResolution,
            seed,
            in_scene: batchParams.in_scene,
            shot_id: batchParams.shot_id,
            output_format: batchParams.output_format,
            enable_sync_mode: batchParams.enable_sync_mode,
            max_wait_seconds: batchParams.max_wait_seconds,
            enable_base64_output: batchParams.enable_base64_output,
            tool_type: batchParams.tool_type,
            loras: batchParams.loras,
            based_on: batchParams.based_on,
            source_variant_id: batchParams.source_variant_id,
            create_as_generation: batchParams.create_as_generation,
            hires_fix: batchParams.hires_fix,
            qwen_edit_model: batchParams.qwen_edit_model,
          } as MagicEditTaskParams;
        });
      },
      createSingleTask: createMagicEditTask,
      operationName: 'createBatchMagicEditTasks',
    });

  } catch (error) {
    rethrowTaskCreationError(error, { context: 'BatchMagicEdit' });
  }
}

// TaskValidationError is used internally - import from taskCreation.ts if needed externally
