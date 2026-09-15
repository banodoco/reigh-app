import {
  createCharacterAnimationTask,
  validateRequiredFields,
  TaskValidationError
} from "@/shared/lib/taskCreation";
import type { RuntimeInput, TaskCreationResult } from "@/shared/lib/taskCreation";
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

/**
 * Interface for character animate (Wan2.2-Animate) task parameters
 */
export interface CharacterAnimateTaskParams {
  project_id: string;
  character_image?: RuntimeInput;
  character_image_url: string;
  motion_video?: RuntimeInput;
  motion_video_url: string;
  prompt?: string;
  mode: 'replace' | 'animate';
  resolution: '480p' | '720p';
  seed?: number;
  random_seed?: boolean;
}

/**
 * Default values for character animate task settings
 */
const DEFAULT_CHARACTER_ANIMATE_VALUES = {
  mode: 'animate' as const,
  resolution: '480p' as const,
  prompt: 'natural expression; preserve outfit details',
  seed: Math.floor(Math.random() * 1000000),
  random_seed: true,
};

/**
 * Validates character animate task parameters
 * 
 * @param params - Parameters to validate
 * @throws TaskValidationError if validation fails
 */
function validateCharacterAnimateParams(params: CharacterAnimateTaskParams): void {
  validateRequiredFields(params, [
    'project_id',
    'character_image_url',
    'motion_video_url',
    'mode',
    'resolution'
  ]);

  // Additional validations
  if (!params.character_image_url) {
    throw new TaskValidationError("character_image_url is required", 'character_image_url');
  }

  if (!params.motion_video_url) {
    throw new TaskValidationError("motion_video_url is required", 'motion_video_url');
  }

  if (!['replace', 'animate'].includes(params.mode)) {
    throw new TaskValidationError("mode must be 'replace' or 'animate'", 'mode');
  }

  if (!['480p', '720p'].includes(params.resolution)) {
    throw new TaskValidationError("resolution must be '480p' or '720p'", 'resolution');
  }
}

/**
 * Creates a character animate task using the unified approach
 * 
 * @param params - Character animate task parameters
 * @returns Promise resolving to the created task
 */
export async function createCharacterAnimateTask(params: CharacterAnimateTaskParams): Promise<TaskCreationResult> {

  try {
    // 1. Validate parameters
    validateCharacterAnimateParams(params);

    const seed = params.random_seed
      ? Math.floor(Math.random() * 2_147_483_648)
      : (params.seed ?? DEFAULT_CHARACTER_ANIMATE_VALUES.seed);
    const result = await createCharacterAnimationTask(params.project_id, {
      characterImage: params.character_image,
      characterImageUrl: params.character_image_url,
      motionVideo: params.motion_video,
      motionVideoUrl: params.motion_video_url,
      prompt: params.prompt ?? DEFAULT_CHARACTER_ANIMATE_VALUES.prompt,
      mode: params.mode ?? DEFAULT_CHARACTER_ANIMATE_VALUES.mode,
      resolution: params.resolution ?? DEFAULT_CHARACTER_ANIMATE_VALUES.resolution,
      seed,
      randomSeed: params.random_seed ?? DEFAULT_CHARACTER_ANIMATE_VALUES.random_seed,
    });

    return result;

  } catch (error) {
    normalizeAndPresentError(error, { context: 'CharacterAnimate', showToast: false });
    throw error;
  }
}

// TaskValidationError is used internally - import from taskCreation.ts if needed externally
