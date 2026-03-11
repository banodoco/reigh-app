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
  StructureVideoConfigWithLegacyGuidance,
} from './uiTypes';

// convertLegacyStructureType is internal - import from types.ts if needed externally

// Defaults - used internally, only export what's needed externally
export {
  DEFAULT_STRUCTURE_VIDEO,
} from './defaults';
export {
  resolvePrimaryStructureVideo,
  type PrimaryStructureVideo,
} from './primaryStructureVideo';
export {
  resolveTravelStructureState,
  type ResolveTravelStructureStateOptions,
  type ResolvedTravelStructureState,
} from './structureState';
;

// buildTravelBetweenImagesPayload is internal - used by createTravelBetweenImagesTask

// Main task creator
export { createTravelBetweenImagesTask } from './createTravelBetweenImagesTask';
export { createTravelBetweenImagesTaskWithParentGeneration } from './createTravelBetweenImagesTask';
export { validateTravelBetweenImagesParams } from './payloadBuilder';

// TaskValidationError is used internally - import from taskCreation.ts if needed externally
