import { PhaseConfig } from '@/shared/types/phaseConfig';
import type { PathLoraConfig } from '@/domains/lora/types/lora';
import type {
  ContinuationConfig,
  StructureGuidanceConfig,
  StructureVideoConfig,
  TravelGuidance,
} from '../../travelBetweenImages/taskTypes';
import type { UnknownRecord } from '../../taskParamParsers';

export interface IndividualTravelSegmentParams {
  project_id: string;
  parent_generation_id?: string;
  shot_id?: string;
  child_generation_id?: string;
  originalParams?: Record<string, unknown>;
  segment_index: number;
  start_image_url: string;
  end_image_url?: string;
  start_image_generation_id?: string;
  end_image_generation_id?: string;
  start_image_variant_id?: string;
  end_image_variant_id?: string;
  pair_shot_generation_id?: string;
  model_name?: string;
  model_type?: 'i2v' | 'vace';
  base_prompt?: string;
  enhanced_prompt?: string;
  negative_prompt?: string;
  num_frames?: number;
  frame_overlap_from_previous?: number;
  continuation_config?: ContinuationConfig;
  seed?: number;
  random_seed?: boolean;
  amount_of_motion?: number;
  advanced_mode?: boolean;
  phase_config?: PhaseConfig;
  motion_mode?: MotionMode;
  selected_phase_preset_id?: string | null;
  loras?: PathLoraConfig[];
  travel_guidance?: TravelGuidance;
  structure_guidance?: StructureGuidanceConfig;
  structure_videos?: StructureVideoConfig[];
  generation_name?: string;
  parsed_resolution_wh?: string;
  num_inference_steps?: number;
  guidance_scale?: number;
  make_primary_variant?: boolean;
  is_last_segment?: boolean;
}

export type MotionMode = 'basic' | 'presets' | 'advanced';

export interface SegmentBuildState {
  orig: UnknownRecord;
  orchDetails: UnknownRecord;
  inputImages: string[];
  allInputImages: unknown;
  finalSeed: number;
  additionalLoras: Record<string, number>;
  motionMode: MotionMode;
  amountOfMotion: number;
  phaseConfig: PhaseConfig;
  advancedMode: boolean;
  loraMultipliers: Array<{ url: string; multiplier: number }>;
  modelName: string;
  flowShift: number;
  sampleSolver: string;
  guidanceScale: number;
  guidance2Scale: number;
  guidancePhases: number;
  numInferenceSteps: number;
  modelSwitchPhase: number;
  switchThreshold: unknown;
  numFrames: number;
  basePrompt: string;
  negativePrompt: string;
  enhancedPrompt?: string;
  fpsHelpers: number;
  segmentFramesExpanded: unknown;
  frameOverlapExpanded: unknown;
  continuationConfig?: ContinuationConfig;
  travelGuidance?: TravelGuidance;
  structureGuidance?: UnknownRecord;
  structureVideos?: StructureVideoConfig[];
}

export interface SegmentPostProcessValues {
  motionMode: MotionMode;
  afterFirstPostGenerationSaturation: number;
  afterFirstPostGenerationBrightness: number;
}
