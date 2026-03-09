// Types
export type {
  StructureGuidanceConfig,
  StructureVideoConfig,
  PromptConfig,
  MotionConfig,
  ModelConfig,
  TravelBetweenImagesRequestPayload,
  
  StitchConfig,
} from './types';
export type {
  StructureVideoConfigWithMetadata,
  
} from './uiTypes';

// convertLegacyStructureType is internal - import from types.ts if needed externally

// Defaults - used internally, only export what's needed externally
export {
  DEFAULT_STRUCTURE_VIDEO,
  DEFAULT_VIDEO_STRUCTURE_PARAMS,
} from './defaults';
export {
  resolvePrimaryStructureVideo,
  type PrimaryStructureVideo,
} from './primaryStructureVideo';
;

// buildTravelBetweenImagesPayload is internal - used by createTravelBetweenImagesTask

// Main task creator
export { createTravelBetweenImagesTask } from './createTravelBetweenImagesTask';
export { validateTravelBetweenImagesParams } from './payloadBuilder';

// TaskValidationError is used internally - import from taskCreation.ts if needed externally
