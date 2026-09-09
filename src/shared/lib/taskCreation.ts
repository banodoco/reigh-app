export type {
  BaseTaskParams,
  HiresFixApiParams,
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
  IMAGE_GENERATION_CAPABILITY_ID,
  createImageGenerationTasks,
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
