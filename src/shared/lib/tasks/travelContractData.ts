import type { TaskPayloadSnapshot } from './taskPayloadSnapshot';
import { createTravelPayloadReader, type TravelPayloadSource } from './travelPayloadReader';
import { asRecord, type UnknownRecord } from './taskParamParsers';

const CONTRACT_SOURCES: TravelPayloadSource[] = [
  'taskViewContract',
  'individualSegmentParams',
  'familyContract',
];

const LEGACY_SOURCES: TravelPayloadSource[] = [
  'orchestratorDetails',
  'rawParams',
  'fullOrchestratorPayload',
];

const CONTRACT_THEN_LEGACY: TravelPayloadSource[] = [
  ...CONTRACT_SOURCES,
  ...LEGACY_SOURCES,
];

export interface TravelContractData {
  inputImages?: string[];
  prompt?: string;
  enhancedPrompt?: string;
  negativePrompt?: string;
  modelName?: string;
  resolution?: string;
  motionMode?: string;
  selectedPhasePresetId?: string;
  advancedMode?: boolean;
  amountOfMotion?: number;
  phaseConfig?: UnknownRecord;
  additionalLoras?: UnknownRecord;
  structureGuidance?: UnknownRecord;
  segmentFramesExpanded?: number[];
  frameOverlapExpanded?: number[];
}

function pickRecord(reader: ReturnType<typeof createTravelPayloadReader>, key: string): UnknownRecord | undefined {
  const contractRecord = reader.pickRecord(key, CONTRACT_SOURCES);
  if (contractRecord) {
    return contractRecord;
  }
  const legacyRecord = reader.pickRecord(key, LEGACY_SOURCES);
  return legacyRecord;
}

export function readTravelContractData(snapshot: TaskPayloadSnapshot): TravelContractData {
  const reader = createTravelPayloadReader(snapshot);
  const structureGuidance = pickRecord(reader, 'structure_guidance');
  const phaseConfig = pickRecord(reader, 'phase_config');

  return {
    inputImages: reader.pickStringArray('input_images', CONTRACT_THEN_LEGACY)
      ?? reader.pickStringArray('input_image_paths_resolved', LEGACY_SOURCES),
    prompt: reader.pickString('prompt', CONTRACT_THEN_LEGACY)
      ?? reader.pickString('base_prompt', LEGACY_SOURCES),
    enhancedPrompt: reader.pickString('enhanced_prompt', CONTRACT_THEN_LEGACY),
    negativePrompt: reader.pickString('negative_prompt', CONTRACT_THEN_LEGACY),
    modelName: reader.pickString('model_name', CONTRACT_THEN_LEGACY),
    resolution: reader.pickString('resolution', CONTRACT_THEN_LEGACY)
      ?? reader.pickString('parsed_resolution_wh', LEGACY_SOURCES),
    motionMode: reader.pickString('motion_mode', CONTRACT_THEN_LEGACY),
    selectedPhasePresetId: reader.pickString('selected_phase_preset_id', CONTRACT_THEN_LEGACY),
    advancedMode: reader.pickBoolean('advanced_mode', CONTRACT_THEN_LEGACY),
    amountOfMotion: reader.pickNumber('amount_of_motion', CONTRACT_THEN_LEGACY),
    phaseConfig,
    additionalLoras: pickRecord(reader, 'additional_loras'),
    structureGuidance,
    segmentFramesExpanded: reader.pickNumberArray('segment_frames_expanded', CONTRACT_THEN_LEGACY),
    frameOverlapExpanded: reader.pickNumberArray('frame_overlap_expanded', CONTRACT_THEN_LEGACY),
  };
}

export function readTravelStructureVideoFromGuidance(structureGuidance?: UnknownRecord): UnknownRecord | undefined {
  if (!structureGuidance) {
    return undefined;
  }
  const videos = structureGuidance.videos;
  if (!Array.isArray(videos) || videos.length === 0) {
    return undefined;
  }
  return asRecord(videos[0]);
}
