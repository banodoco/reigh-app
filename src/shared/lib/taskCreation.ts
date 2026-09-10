export type {
  BaseTaskParams,
  HiresFixApiParams,
  RuntimeInput,
  TaskCreationResult,
} from './taskCreation/types';

export {
  TaskValidationError,
} from './taskCreation/types';

export {
  resolveProjectResolution,
} from './taskCreation/resolution';

export {
  generateUUID,
  generateTaskId,
  generateRunId,
} from './taskCreation/ids';

export {
  createTask,
  bindTaskCapability,
  resolveTaskCapability,
} from './taskCreation/createTask';

export {
  CHARACTER_ANIMATION_CAPABILITY_ID,
  IMAGE_UPSCALE_CAPABILITY_ID,
  VIDEO_ENHANCE_CAPABILITY_ID,
  createCharacterAnimationTask,
  createImageUpscaleTask,
  createVideoEnhanceTask,
} from './taskCreation/mediaEnhancement';

export {
  IMAGE_GENERATION_CAPABILITY_ID,
  createImageGenerationTasks,
  createImageToImageTask,
  compileImageGenerationParams,
} from './taskCreation/imageGeneration';

export {
  validateRequiredFields,
  safeParseJson,
} from './taskCreation/validation';

export {
  resolveSeed32Bit,
  validateLoraConfigs,
  validateNonEmptyString,
  validateNumericRange,
  validateSeed32Bit,
  validateUrlString,
  mapPathLorasToStrengthRecord,
} from './taskCreation/schemaUtils';
