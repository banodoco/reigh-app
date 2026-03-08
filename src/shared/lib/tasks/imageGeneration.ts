import {
  generateTaskId,
  resolveProjectResolution,
  type HiresFixApiParams,
} from '../taskCreation';
import type { TaskCreationResult } from '../taskCreation';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/media/aspectRatios';
import { runBatchTaskPipeline } from './batchTaskPipeline';
import { rethrowTaskCreationError } from './taskCreationError';
import { composeTaskParams, composeTaskRequest } from './taskRequestComposer';
import { composeOptionalFields } from './taskFieldPolicy';
import { runTaskCreationPipeline } from './taskCreatorPipeline';
import {
  buildHiresOverride,
  buildImageGenerationBaseParams,
  buildLorasParam,
  buildReferenceParams,
} from './imageGenerationBuilders';
import {
  validateBatchImageGenerationParams,
  validateImageGenerationParams,
} from './imageGenerationValidators';
import type {
  BatchImageGenerationTaskParams,
  CalculateTaskResolutionOptions,
  ImageGenerationTaskParams,
} from './imageGenerationTypes';

;
export type {
  BatchImageGenerationTaskParams,
  ReferenceApiParams,
  ReferenceMode,
} from './imageGenerationTypes';

/**
 * Calculates the final resolution for image generation tasks.
 * Applies user-configurable scaling for supported image generation models.
 */
async function calculateTaskResolution(
  options: CalculateTaskResolutionOptions,
): Promise<string> {
  const { projectId, resolution_scale, resolution_mode, custom_aspect_ratio } = options;

  if (options.customResolution?.trim()) {
    return options.customResolution.trim();
  }

  const baseResolution = (() => {
    if (resolution_mode === 'custom' && custom_aspect_ratio) {
      return ASPECT_RATIO_TO_RESOLUTION[custom_aspect_ratio] ?? '902x508';
    }
    return null;
  })();

  const resolvedBaseResolution = baseResolution
    ?? (await resolveProjectResolution(projectId)).resolution;

  const isImageGenerationModel = options.modelName === 'qwen-image'
    || options.modelName === 'qwen-image-2512'
    || options.modelName === 'z-image';

  if (isImageGenerationModel) {
    const scale = resolution_scale ?? 1.5;
    const [width, height] = resolvedBaseResolution.split('x').map(Number);
    return `${Math.round(width * scale)}x${Math.round(height * scale)}`;
  }

  return resolvedBaseResolution;
}

const IN_SCENE_LORA_URL = 'https://huggingface.co/peteromallet/random_junk/resolve/main/in_scene_different_object_000010500.safetensors';

/**
 * Creates a single image generation task using the unified approach.
 */
async function createImageGenerationTask(
  params: ImageGenerationTaskParams,
): Promise<TaskCreationResult> {
  return runTaskCreationPipeline({
    params,
    context: 'ImageGeneration',
    validate: validateImageGenerationParams,
    buildTaskRequest: async (requestParams) => {
      const finalResolution = await calculateTaskResolution({
        projectId: requestParams.project_id,
        customResolution: requestParams.resolution,
        modelName: requestParams.model_name,
      });

      const taskType = (() => {
        const modelName = requestParams.model_name;
        const hasStyleRef = !!requestParams.style_reference_image;
        switch (modelName) {
          case 'qwen-image':
            return hasStyleRef ? 'qwen_image_style' : 'qwen_image';
          case 'qwen-image-2512':
            return 'qwen_image_2512';
          case 'z-image':
            return 'z_image_turbo';
          default:
            return 'wan_2_2_t2i';
        }
      })();

      const supportsReferenceParamsModel =
        requestParams.model_name?.startsWith('qwen-image') || requestParams.model_name === 'z-image';
      const taskId = generateTaskId(taskType);

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
            include: (value) => typeof value === 'string' && value.trim().length > 0,
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
 * Creates multiple image generation tasks in parallel (batch generation).
 */
export async function createBatchImageGenerationTasks(
  params: BatchImageGenerationTaskParams,
): Promise<TaskCreationResult[]> {
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
