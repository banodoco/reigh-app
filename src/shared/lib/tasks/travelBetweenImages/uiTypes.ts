import type {
  ModelConfig,
  MotionConfig,
  PromptConfig,
  StructureVideoConfig,
} from './types';

/**
 * Editor-only guidance fields kept alongside each structure video while
 * request payloads remain canonicalized through structure_guidance.
 */
interface StructureVideoGuidanceUiFields {
  motion_strength?: number;
  structure_type?: 'uni3c' | 'flow' | 'canny' | 'depth';
  uni3c_start_percent?: number;
  uni3c_end_percent?: number;
}

/**
 * Editor-facing structure-video model with local metadata and UI-only control
 * fields derived from the canonical guidance contract.
 * This type is for UI state only and is not the canonical API payload contract.
 */
export interface StructureVideoConfigWithMetadata extends StructureVideoConfig, StructureVideoGuidanceUiFields {
  metadata?: import('@/shared/lib/videoUploader').VideoMetadata | null;
  resource_id?: string | null;
}

/**
 * UI-only state model for composing travel request payloads in the editor.
 */
interface TravelBetweenImagesUiState {
  promptConfig: PromptConfig;
  motionConfig: MotionConfig;
  modelConfig: ModelConfig;
  structureVideos?: StructureVideoConfigWithMetadata[];
}
