// Types
export type {
  StructureVideoConfig,
  PromptConfig,
  MotionConfig,
  ModelConfig,
  TravelBetweenImagesRequestPayload,
  TravelBetweenImagesTaskInput,
  StitchConfig,
} from './types';
export type {
  StructureVideoConfigWithMetadata,
  TravelBetweenImagesUiState,
} from './uiTypes';

// convertLegacyStructureType is internal - import from types.ts if needed externally

// Defaults - used internally, only export what's needed externally
export {
  DEFAULT_VIDEO_STRUCTURE_PARAMS,
} from './defaults';

// buildTravelBetweenImagesPayload is internal - used by createTravelBetweenImagesTask

// Main task creator
export { createTravelBetweenImagesTask } from './createTravelBetweenImagesTask';
export { validateTravelBetweenImagesParams } from './payloadBuilder';

// TaskValidationError is used internally - import from taskCreation.ts if needed externally
