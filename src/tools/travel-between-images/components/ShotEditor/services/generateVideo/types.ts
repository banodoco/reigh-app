import type { QueryClient } from '@tanstack/react-query';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type {
  MotionConfig,
  ModelConfig,
  PromptConfig,
  StitchConfig,
  StructureVideoConfigWithMetadata,
} from '@/shared/lib/tasks/travelBetweenImages';
import type { SegmentOverrides } from '@/shared/lib/settingsMigration';
import type { Shot } from '@/domains/generation/types/shotViewRow';
import type { OperationResult } from '@/shared/lib/operationResult';

export interface GenerateVideoParams {
  projectId: string;
  selectedShotId: string;
  selectedShot: Shot;
  queryClient: QueryClient;
  effectiveAspectRatio: string | null;
  generationMode: 'timeline' | 'batch' | 'by-pair';
  promptConfig: PromptConfig;
  motionConfig: MotionConfig;
  modelConfig: ModelConfig;
  structureVideos?: StructureVideoConfigWithMetadata[];
  batchVideoFrames: number;
  selectedLoras: Array<{ id: string; path: string; strength: number; name: string }>;
  variantNameParam: string;
  clearAllEnhancedPrompts: () => Promise<void>;
  parentGenerationId?: string;
  stitchConfig?: StitchConfig;
}

export interface GenerateVideoSuccessValue {
  parentGenerationId?: string;
}

export type GenerateVideoResult = OperationResult<GenerateVideoSuccessValue>;

export interface ShotGenRow {
  id: string;
  generation_id: string | null;
  timeline_frame: number | null;
  metadata: Record<string, unknown> | null;
  generation: {
    id: string;
    location: string | null;
    type: string | null;
    primary_variant_id?: string | null;
  } | null;
}

export interface ImagePayload {
  absoluteImageUrls: string[];
  imageGenerationIds: string[];
  imageVariantIds: string[];
  pairShotGenerationIds: string[];
}

export interface PairConfigPayload {
  basePrompts: string[];
  segmentFrames: number[];
  frameOverlap: number[];
  negativePrompts: string[];
  enhancedPromptsArray: Array<string | null>;
  pairPhaseConfigsArray: Array<PhaseConfig | null>;
  pairLorasArray: Array<Array<{ path: string; strength: number }> | null>;
  pairMotionSettingsArray: Array<Record<string, unknown> | null>;
}

export interface ModelPhaseSelection {
  actualModelName: string;
  effectivePhaseConfig: PhaseConfig;
  useAdvancedMode: boolean;
}

export interface PairOverridesExtraction {
  overrides: SegmentOverrides;
  enhancedPrompt: string | undefined;
}

export interface MotionParams {
  amountOfMotion: number;
  motionMode: MotionConfig['motion_mode'];
  useAdvancedMode: boolean;
  effectivePhaseConfig: PhaseConfig;
  selectedPhasePresetId: string | null | undefined;
}

export interface GenerationParams {
  generationMode: GenerateVideoParams['generationMode'];
  batchVideoPrompt: string;
  enhancePrompt: boolean;
  variantNameParam: string;
  textBeforePrompts: string | undefined;
  textAfterPrompts: string | undefined;
}

export interface SeedParams {
  seed: number;
  randomSeed: boolean | undefined;
  turboMode: boolean | undefined;
  debug: boolean | undefined;
}

export interface BuildTravelRequestBodyParams {
  projectId: string;
  selectedShot: Shot;
  imagePayload: ImagePayload;
  pairConfig: PairConfigPayload;
  parentGenerationId?: string;
  actualModelName: string;
  generationTypeMode: ModelConfig['generation_type_mode'];
  motionParams: MotionParams;
  generationParams: GenerationParams;
  seedParams: SeedParams;
}
