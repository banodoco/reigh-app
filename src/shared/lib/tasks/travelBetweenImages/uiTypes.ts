import type {
  ModelConfig,
  MotionConfig,
  PromptConfig,
  StructureVideoConfig,
} from './types';
import type { LegacyStructureVideoFields } from './legacyStructureVideo';

/**
 * UI compatibility fields retained for editor state while canonical payload
 * contracts stay legacy-free in `types.ts`.
 */
export type StructureVideoLegacyUiFields = LegacyStructureVideoFields;

/**
 * Editor-facing structure-video model with local metadata and legacy UI knobs.
 * This type is for UI state only and is not the canonical API payload contract.
 */
export interface StructureVideoConfigWithMetadata extends StructureVideoConfig, StructureVideoLegacyUiFields {
  metadata?: import('@/shared/lib/videoUploader').VideoMetadata | null;
  resource_id?: string | null;
}

/**
 * UI-only state model for composing travel request payloads in the editor.
 */
export interface TravelBetweenImagesUiState {
  promptConfig: PromptConfig;
  motionConfig: MotionConfig;
  modelConfig: ModelConfig;
  structureVideos?: StructureVideoConfigWithMetadata[];
}
