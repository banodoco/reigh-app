export const TASK_FAMILY_CONTRACT_VERSION = 1 as const;

export type SegmentRegenerationMode = 'segment_regen_from_pair' | 'segment_regen_from_order';
export type GenerationRoutingMode = 'variant_child' | 'child_generation';
export type JoinClipsMode = 'legacy_join' | 'multi_clip_join' | 'video_edit_join';

export interface JoinClipsFamilyContract {
  contract_version: typeof TASK_FAMILY_CONTRACT_VERSION;
  mode: JoinClipsMode;
  run_id: string;
  clips: string[];
  overrides_count: number;
  has_audio: boolean;
}

export interface IndividualSegmentFamilyContract {
  contract_version: typeof TASK_FAMILY_CONTRACT_VERSION;
  segment_regen_mode: SegmentRegenerationMode;
  generation_routing: GenerationRoutingMode;
  segment_index: number;
  has_end_image: boolean;
  has_pair_shot_generation_id: boolean;
}

export interface TravelBetweenImagesFamilyContract {
  contract_version: typeof TASK_FAMILY_CONTRACT_VERSION;
  segment_regen_mode: SegmentRegenerationMode;
  image_count: number;
  segment_count: number;
  has_pair_ids: boolean;
  read_contract?: TravelBetweenImagesReadContract;
}

export interface TravelBetweenImagesReadContract {
  contract_version: typeof TASK_FAMILY_CONTRACT_VERSION;
  prompt?: string;
  enhanced_prompt?: string;
  negative_prompt?: string;
  model_name?: string;
  resolution?: string;
  enhance_prompt?: boolean;
  motion_mode?: string;
  selected_phase_preset_id?: string | null;
  advanced_mode?: boolean;
  amount_of_motion?: number;
  phase_config?: unknown;
  additional_loras?: Record<string, number>;
  segment_frames_expanded?: number[];
  frame_overlap_expanded?: number[];
  structure_guidance?: unknown;
}

interface BuildJoinClipsContractInput {
  mode: JoinClipsMode;
  runId: string;
  clipUrls: string[];
  overridesCount: number;
  hasAudio: boolean;
}

interface BuildIndividualSegmentContractInput {
  segmentRegenerationMode: SegmentRegenerationMode;
  generationRouting: GenerationRoutingMode;
  segmentIndex: number;
  hasEndImage: boolean;
  hasPairShotGenerationId: boolean;
}

interface BuildTravelBetweenImagesContractInput {
  segmentRegenerationMode: SegmentRegenerationMode;
  imageCount: number;
  segmentCount: number;
  hasPairIds: boolean;
  readContract?: TravelBetweenImagesReadContract;
}

export function buildJoinClipsFamilyContract(
  input: BuildJoinClipsContractInput,
): JoinClipsFamilyContract {
  return {
    contract_version: TASK_FAMILY_CONTRACT_VERSION,
    mode: input.mode,
    run_id: input.runId,
    clips: input.clipUrls,
    overrides_count: input.overridesCount,
    has_audio: input.hasAudio,
  };
}

export function buildIndividualSegmentFamilyContract(
  input: BuildIndividualSegmentContractInput,
): IndividualSegmentFamilyContract {
  return {
    contract_version: TASK_FAMILY_CONTRACT_VERSION,
    segment_regen_mode: input.segmentRegenerationMode,
    generation_routing: input.generationRouting,
    segment_index: input.segmentIndex,
    has_end_image: input.hasEndImage,
    has_pair_shot_generation_id: input.hasPairShotGenerationId,
  };
}

export function buildTravelBetweenImagesFamilyContract(
  input: BuildTravelBetweenImagesContractInput,
): TravelBetweenImagesFamilyContract {
  const contract: TravelBetweenImagesFamilyContract = {
    contract_version: TASK_FAMILY_CONTRACT_VERSION,
    segment_regen_mode: input.segmentRegenerationMode,
    image_count: input.imageCount,
    segment_count: input.segmentCount,
    has_pair_ids: input.hasPairIds,
  };
  if (input.readContract) {
    contract.read_contract = input.readContract;
  }
  return contract;
}
