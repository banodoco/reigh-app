import {
  validateRequiredFields,
  TaskValidationError,
  validateNonEmptyString,
  validateSeed32Bit,
  validateLoraConfigs,
} from '../../../taskCreation';
import type {
  BatchImageGenerationTaskParams,
  ImageGenerationTaskParams,
} from './types';
import type { PathLoraConfig } from '@/domains/lora/types/lora';

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

export function validateImageGenerationParams(params: ImageGenerationTaskParams): void {
  validateRequiredFields(params, ['project_id', 'prompt']);
  validateNonEmptyString(params.prompt, 'prompt', 'Prompt');
  validateSeed32Bit(params.seed);
  validateLoras(params.loras);
}

export function validateBatchImageGenerationParams(
  params: BatchImageGenerationTaskParams,
): void {
  validateRequiredFields(params, ['project_id', 'prompts', 'imagesPerPrompt']);

  if (params.prompts.length === 0) {
    throw new TaskValidationError('At least one prompt is required', 'prompts');
  }

  if (params.imagesPerPrompt < 1 || params.imagesPerPrompt > 16) {
    throw new TaskValidationError('Images per prompt must be between 1 and 16', 'imagesPerPrompt');
  }

  params.prompts.forEach((prompt, index) => {
    if (!prompt.fullPrompt || prompt.fullPrompt.trim() === '') {
      throw new TaskValidationError(
        `Prompt ${index + 1}: fullPrompt cannot be empty`,
        `prompts[${index}].fullPrompt`,
      );
    }
  });

  validateLoras(params.loras);
}
