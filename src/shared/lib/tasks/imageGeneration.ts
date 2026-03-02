import {
  generateTaskId,
  resolveProjectResolution,
  validateRequiredFields,
  TaskValidationError,
  validateNonEmptyString,
  validateSeed32Bit,
  validateLoraConfigs,
  mapPathLorasToStrengthRecord,
  type HiresFixApiParams,
} from '../taskCreation';
import type { TaskCreationResult } from '../taskCreation';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/media/aspectRatios';
import type { PathLoraConfig } from '@/shared/types/lora';
import { runBatchTaskPipeline } from './batchTaskPipeline';
import { rethrowTaskCreationError } from './taskCreationError';
import { composeTaskParams, composeTaskRequest } from './taskRequestComposer';
import { composeOptionalFields, isNonEmptyString } from './taskFieldPolicy';
import { runTaskCreationPipeline } from './taskCreatorPipeline';
import { resolveByPrecedence } from './taskParamContract';

// ============================================================================
// API Parameter Types (single source of truth)
// ============================================================================

/** Reference mode for image generation */
export type ReferenceMode = 'style' | 'subject' | 'style-character' | 'scene' | 'custom';

/**
 * Reference-related API parameters for image generation tasks.
 * Uses snake_case to match API directly.
 */
export interface ReferenceApiParams {
  style_reference_image?: string;
  subject_reference_image?: string;
  style_reference_strength: number;
  subject_strength: number;
  subject_description: string;
  in_this_scene: boolean;
  in_this_scene_strength: number;
  reference_mode: ReferenceMode;
}

// HiresFixApiParams is now defined in taskCreation.ts — re-export for backward compatibility
export type { HiresFixApiParams } from '../taskCreation';

/**
 * Filter reference settings based on the selected reference mode.
 * This ensures only relevant settings are passed to the backend based on what mode is active.
 */
function filterReferenceSettingsByMode(
  referenceMode: 'style' | 'subject' | 'style-character' | 'scene' | 'custom' | undefined,
  settings: {
    style_reference_strength?: number;
    subject_strength?: number;
    subject_description?: string;
    in_this_scene?: boolean;
    in_this_scene_strength?: number;
  }
): Partial<typeof settings> {
  // If no mode specified or custom mode, pass all settings as-is
  if (!referenceMode || referenceMode === 'custom') {
    return settings;
  }

  const filtered: Partial<typeof settings> = {};
  
  switch (referenceMode) {
    case 'style':
      // Style mode: only pass style strength, exclude subject and scene
      if (settings.style_reference_strength !== undefined) {
        filtered.style_reference_strength = settings.style_reference_strength;
      }
      break;

    case 'subject':
      // Subject mode: style at 1.1, subject at 0.5, plus description
      filtered.style_reference_strength = 1.1;
      filtered.subject_strength = 0.5;
      if (settings.subject_description !== undefined && settings.subject_description.trim()) {
        filtered.subject_description = settings.subject_description;
      }
      break;

    case 'style-character':
      // Style + Subject mode: pass both style and subject, exclude scene
      if (settings.style_reference_strength !== undefined) {
        filtered.style_reference_strength = settings.style_reference_strength;
      }
      if (settings.subject_strength !== undefined) {
        filtered.subject_strength = settings.subject_strength;
      }
      if (settings.subject_description !== undefined && settings.subject_description.trim()) {
        filtered.subject_description = settings.subject_description;
      }
      break;

    case 'scene':
      // Scene mode: style at 1.1, scene strength at 0.5
      filtered.style_reference_strength = 1.1;
      filtered.in_this_scene = true;
      filtered.in_this_scene_strength = 0.5;
      break;
  }
  
  return filtered;
}

/**
 * Parameters for creating an image generation task.
 * Extends ReferenceApiParams and HiresFixApiParams for single source of truth.
 */
interface ImageGenerationTaskParams extends Partial<ReferenceApiParams>, Partial<HiresFixApiParams> {
  project_id: string;
  prompt: string;
  negative_prompt?: string;
  resolution?: string;
  model_name?: string;
  seed?: number;
  loras?: PathLoraConfig[];
  shot_id?: string;
  subject_reference_image?: string; // Can differ from style_reference_image
  steps?: number;
}

/**
 * Parameters for creating multiple image generation tasks (batch generation).
 * Extends ReferenceApiParams and HiresFixApiParams for single source of truth.
 */
export interface BatchImageGenerationTaskParams extends Partial<ReferenceApiParams>, Partial<HiresFixApiParams> {
  project_id: string;
  prompts: Array<{
    id: string;
    fullPrompt: string;
    shortPrompt?: string;
  }>;
  imagesPerPrompt: number;
  loras?: PathLoraConfig[];
  shot_id?: string;
  resolution?: string;
  /** User-configurable resolution scale multiplier (1.0-2.5x). If not provided, defaults to 1.5. */
  resolution_scale?: number;
  /** Resolution mode: 'project' uses project dimensions, 'custom' uses custom_aspect_ratio */
  resolution_mode?: 'project' | 'custom';
  /** Custom aspect ratio when resolution_mode is 'custom' (e.g., "16:9") */
  custom_aspect_ratio?: string;
  model_name?: string;
  subject_reference_image?: string; // Can differ from style_reference_image
  steps?: number;
}

/**
 * Validates an array of LoRA configs.
 * Shared by single and batch image generation validation.
 * @throws TaskValidationError if any LoRA is invalid
 */
function validateLoras(loras: PathLoraConfig[] | undefined): void {
  try {
    validateLoraConfigs(loras, {
      pathField: 'path',
      strengthField: 'strength',
      strengthLabel: 'strength',
      min: 0,
      max: 2,
    });
  } catch (error) {
    const maybeError = error as { field?: string; message?: string };
    if (
      typeof maybeError.field === 'string'
      && maybeError.field.endsWith('.strength')
      && typeof maybeError.message === 'string'
      && maybeError.message.includes('must be between 0 and 2')
    ) {
      throw new TaskValidationError(
        maybeError.message.replace('must be between', 'must be a number between'),
        maybeError.field,
      );
    }
    throw error;
  }
}

/**
 * Validates image generation task parameters
 * @param params - Parameters to validate
 * @throws TaskValidationError if validation fails
 */
function validateImageGenerationParams(params: ImageGenerationTaskParams): void {
  validateRequiredFields(params, ['project_id', 'prompt']);

  // Additional validation specific to image generation
  validateNonEmptyString(params.prompt, 'prompt', 'Prompt');
  validateSeed32Bit(params.seed);

  validateLoras(params.loras);
}

/**
 * Validates batch image generation parameters
 * @param params - Parameters to validate
 * @throws TaskValidationError if validation fails
 */
function validateBatchImageGenerationParams(params: BatchImageGenerationTaskParams): void {
  validateRequiredFields(params, ['project_id', 'prompts', 'imagesPerPrompt']);

  if (params.prompts.length === 0) {
    throw new TaskValidationError('At least one prompt is required', 'prompts');
  }

  if (params.imagesPerPrompt < 1 || params.imagesPerPrompt > 16) {
    throw new TaskValidationError('Images per prompt must be between 1 and 16', 'imagesPerPrompt');
  }

  params.prompts.forEach((prompt, index) => {
    if (!prompt.fullPrompt || prompt.fullPrompt.trim() === '') {
      throw new TaskValidationError(`Prompt ${index + 1}: fullPrompt cannot be empty`, `prompts[${index}].fullPrompt`);
    }
  });

  validateLoras(params.loras);
}

// Removed buildImageGenerationPayload function - now storing all data at top level to avoid duplication

/**
 * Options for calculateTaskResolution
 */
interface CalculateTaskResolutionOptions {
  /** Project ID for resolution lookup */
  projectId: string;
  /** Optional explicit resolution override (bypasses all calculations) */
  customResolution?: string;
  /** Model name (determines if scaling is applied) */
  modelName?: string;
  /** User-configurable resolution scale multiplier (1.0-2.5x). Defaults to 1.5 for image models. */
  resolution_scale?: number;
  /** Resolution mode: 'project' uses project dimensions, 'custom' uses custom_aspect_ratio */
  resolution_mode?: 'project' | 'custom';
  /** Custom aspect ratio when resolution_mode is 'custom' (e.g., "16:9") */
  custom_aspect_ratio?: string;
}

/**
 * Calculates the final resolution for image generation tasks.
 * Applies user-configurable scaling for supported image generation models.
 * (internal use only - not exported)
 * @param options - Resolution calculation options
 * @returns Promise resolving to the final resolution string
 */
async function calculateTaskResolution(
  options: CalculateTaskResolutionOptions
): Promise<string> {
  const { projectId, resolution_scale, resolution_mode, custom_aspect_ratio } = options;

  // 1. If explicit custom resolution is provided, use it as-is (assumes it's already final)
  if (options.customResolution?.trim()) {
    return options.customResolution.trim();
  }

  // 2. Determine base resolution
  let baseResolution: string;

  if (resolution_mode === 'custom' && custom_aspect_ratio) {
    // Use custom aspect ratio
    baseResolution = ASPECT_RATIO_TO_RESOLUTION[custom_aspect_ratio] ?? '902x508';
  } else {
    // Use project resolution
    const { resolution } = await resolveProjectResolution(projectId);
    baseResolution = resolution;
  }

  // 3. Apply scaling for image generation models
  const isImageGenerationModel = options.modelName === 'qwen-image' || options.modelName === 'qwen-image-2512' || options.modelName === 'z-image';
  if (isImageGenerationModel) {
    const scale = resolution_scale ?? 1.5; // Default to 1.5 if not specified
    const [width, height] = baseResolution.split('x').map(Number);
    const scaledWidth = Math.round(width * scale);
    const scaledHeight = Math.round(height * scale);
    const scaledResolution = `${scaledWidth}x${scaledHeight}`;
    return scaledResolution;
  }

  return baseResolution;
}

const IN_SCENE_LORA_URL = 'https://huggingface.co/peteromallet/random_junk/resolve/main/in_scene_different_object_000010500.safetensors';

function buildLorasParam(
  loras: PathLoraConfig[] | undefined,
  inSceneLora?: { url: string; strength: number },
): { additional_loras?: Record<string, number> } {
  const lorasMap: Record<string, number> = mapPathLorasToStrengthRecord(loras);

  if (inSceneLora && inSceneLora.strength > 0) {
    lorasMap[inSceneLora.url] = inSceneLora.strength;
  }

  return Object.keys(lorasMap).length > 0 ? { additional_loras: lorasMap } : {};
}

function buildReferenceParams(
  styleReferenceImage: string | undefined,
  mode: ReferenceMode | undefined,
  settings: {
    subjectReferenceImage?: string;
    styleReferenceStrength?: number;
    subjectStrength?: number;
    subjectDescription?: string;
    inThisScene?: boolean;
    inThisSceneStrength?: number;
  },
): Record<string, unknown> {
  if (!styleReferenceImage) return {};

  const filteredSettings = filterReferenceSettingsByMode(mode, {
    style_reference_strength: settings.styleReferenceStrength,
    subject_strength: settings.subjectStrength,
    subject_description: settings.subjectDescription,
    in_this_scene: settings.inThisScene,
    in_this_scene_strength: settings.inThisSceneStrength,
  });

  return {
    style_reference_image: styleReferenceImage,
    subject_reference_image: settings.subjectReferenceImage || styleReferenceImage,
    ...filteredSettings,
    ...composeOptionalFields([
      {
        key: 'scene_reference_strength',
        value: filteredSettings.in_this_scene_strength,
      },
    ]),
  };
}

function buildHiresOverride(
  hiresScale: number | undefined,
  hiresDenoise: number | undefined,
  hiresSteps: number | undefined,
  additionalLoras: Record<string, number> | undefined,
  baseLoras: Record<string, number> = {},
): Record<string, unknown> {
  return {
    ...composeOptionalFields([
      { key: 'hires_scale', value: hiresScale },
      { key: 'hires_steps', value: hiresSteps },
      { key: 'hires_denoise', value: hiresDenoise },
    ]),
    ...(additionalLoras && Object.keys(additionalLoras).length > 0
      ? { additional_loras: { ...baseLoras, ...additionalLoras } }
      : {}),
  };
}

function buildImageGenerationBaseParams(
  params: ImageGenerationTaskParams,
  taskId: string,
  finalResolution: string,
): Record<string, unknown> {
  const modelName = resolveByPrecedence(params.model_name, "optimised-t2i") ?? "optimised-t2i";
  const seed = resolveByPrecedence(params.seed, 11111) ?? 11111;
  const steps = resolveByPrecedence(params.steps, 12) ?? 12;

  return {
    task_id: taskId,
    model: modelName,
    prompt: params.prompt,
    resolution: finalResolution,
    seed,
    steps,
    add_in_position: false,
    ...composeOptionalFields([
      {
        key: 'negative_prompt',
        value: params.negative_prompt,
        include: isNonEmptyString,
      },
    ]),
  };
}

/**
 * Creates a single image generation task using the unified approach
 * This replaces the direct call to the single-image-generate edge function
 * (internal use only - used by createBatchImageGenerationTasks)
 *
 * @param params - Image generation task parameters
 * @returns Promise resolving to the created task
 */
async function createImageGenerationTask(params: ImageGenerationTaskParams): Promise<TaskCreationResult> {
  return runTaskCreationPipeline({
    params,
    context: 'ImageGeneration',
    validate: validateImageGenerationParams,
    buildTaskRequest: async (requestParams) => {
      // 1. Calculate final resolution (handles Qwen scaling automatically)
      const finalResolution = await calculateTaskResolution({
        projectId: requestParams.project_id,
        customResolution: requestParams.resolution,
        modelName: requestParams.model_name,
      });

      // 2. Determine task type based on model and whether there's a style reference
      const taskType = (() => {
        const modelName = requestParams.model_name;
        const hasStyleRef = !!requestParams.style_reference_image;

        switch (modelName) {
          case 'qwen-image':
            // Use qwen_image_style for by-reference mode, qwen_image for just-text
            return hasStyleRef ? 'qwen_image_style' : 'qwen_image';
          case 'qwen-image-2512':
            return 'qwen_image_2512';
          case 'z-image':
            return 'z_image_turbo';
          default:
            // Fallback to wan_2_2_t2i for unknown models
            return 'wan_2_2_t2i';
        }
      })();
      const supportsReferenceParamsModel =
        requestParams.model_name?.startsWith('qwen-image') || requestParams.model_name === 'z-image';

      // 3. Generate task ID for orchestration payload (stored in params, not as DB ID)
      const taskId = generateTaskId(taskType);

      // 4. Build intermediate params before assembling the final object
      const lorasParam = buildLorasParam(
        requestParams.loras,
        supportsReferenceParamsModel && requestParams.in_this_scene && requestParams.in_this_scene_strength
          ? { url: IN_SCENE_LORA_URL, strength: requestParams.in_this_scene_strength }
          : undefined,
      );
      const referenceParams = supportsReferenceParamsModel
        ? buildReferenceParams(requestParams.style_reference_image, requestParams.reference_mode, {
            subjectReferenceImage: requestParams.subject_reference_image,
            styleReferenceStrength: requestParams.style_reference_strength ?? 1.0,
            subjectStrength: requestParams.subject_strength ?? 0.0,
            subjectDescription: requestParams.subject_description,
            inThisScene: requestParams.in_this_scene,
            inThisSceneStrength: requestParams.in_this_scene_strength,
          })
        : {};
      const hiresOverride = buildHiresOverride(
        requestParams.hires_scale,
        requestParams.hires_denoise,
        requestParams.hires_steps,
        requestParams.additional_loras,
        lorasParam.additional_loras,
      );

      const taskParamsToSend = composeTaskParams({
        source: requestParams,
        baseParams: buildImageGenerationBaseParams(requestParams, taskId, finalResolution),
        segments: [lorasParam, referenceParams, hiresOverride],
        mappedFields: [
          {
            from: 'shot_id',
            include: (value) => isNonEmptyString(value),
          },
          { from: 'lightning_lora_strength_phase_1' },
          { from: 'lightning_lora_strength_phase_2' },
        ],
      });

      return composeTaskRequest({
        source: requestParams,
        taskType,
        params: taskParamsToSend,
      });
    },
  });
}

/**
 * Creates multiple image generation tasks in parallel (batch generation)
 * This replaces the enqueueTasks pattern used in ImageGenerationForm
 * 
 * @param params - Batch image generation parameters
 * @returns Promise resolving to array of created tasks
 */
export async function createBatchImageGenerationTasks(params: BatchImageGenerationTaskParams): Promise<TaskCreationResult[]> {

  try {
    return await runBatchTaskPipeline({
      batchParams: params,
      validateBatchParams: validateBatchImageGenerationParams,
      buildSingleTaskParams: async (batchParams): Promise<ImageGenerationTaskParams[]> => {
        const finalResolution = await calculateTaskResolution({
          projectId: batchParams.project_id,
          customResolution: batchParams.resolution,
          modelName: batchParams.model_name,
          resolution_scale: batchParams.resolution_scale,
          resolution_mode: batchParams.resolution_mode,
          custom_aspect_ratio: batchParams.custom_aspect_ratio,
        });

        const batchReferenceParams = buildReferenceParams(
          batchParams.style_reference_image,
          batchParams.reference_mode,
          {
            subjectReferenceImage: batchParams.subject_reference_image,
            styleReferenceStrength: batchParams.style_reference_strength,
            subjectStrength: batchParams.subject_strength,
            subjectDescription: batchParams.subject_description,
            inThisScene: batchParams.in_this_scene,
            inThisSceneStrength: batchParams.in_this_scene_strength,
          },
        );

        return batchParams.prompts.flatMap((promptEntry) => (
          Array.from({ length: batchParams.imagesPerPrompt }, () => {
            const seed = Math.floor(Math.random() * 0x7fffffff);

            return {
              project_id: batchParams.project_id,
              prompt: promptEntry.fullPrompt,
              resolution: finalResolution,
              seed,
              loras: batchParams.loras,
              shot_id: batchParams.shot_id,
              model_name: batchParams.model_name,
              steps: batchParams.steps,
              reference_mode: batchParams.reference_mode,
              ...batchReferenceParams,
              ...composeOptionalFields([
                { key: 'hires_scale', value: batchParams.hires_scale },
                { key: 'hires_steps', value: batchParams.hires_steps },
                { key: 'hires_denoise', value: batchParams.hires_denoise },
                { key: 'lightning_lora_strength_phase_1', value: batchParams.lightning_lora_strength_phase_1 },
                { key: 'lightning_lora_strength_phase_2', value: batchParams.lightning_lora_strength_phase_2 },
                {
                  key: 'additional_loras',
                  value: batchParams.additional_loras,
                  include: (value) => Boolean(value && typeof value === 'object'),
                },
              ]),
            } as ImageGenerationTaskParams;
          })
        ));
      },
      createSingleTask: createImageGenerationTask,
      operationName: 'createBatchImageGenerationTasks',
      onSettledResults: import.meta.env.DEV
        ? (results) => {
            results.forEach((result, index) => {
              if (result.status === 'rejected') {
                console.error(`[createBatch] task ${index} FAILED:`, result.reason);
              }
            });
          }
        : undefined,
    });

  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[createBatch] outer catch:', error);
    }
    rethrowTaskCreationError(error, { context: 'BatchImageGeneration' });
  }
}

// TaskValidationError is used internally - import from taskCreation.ts if needed externally
