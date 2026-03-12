import type { TaskPayloadSnapshot } from './taskPayloadSnapshot';
import { createTravelPayloadReader, type TravelPayloadSource } from './travelPayloadReader';
import { asRecord, type UnknownRecord } from './taskParamParsers';
import {
  DEFAULT_STRUCTURE_GUIDANCE_CONTROLS,
  DEFAULT_STRUCTURE_VIDEO,
} from './travelBetweenImages/defaults';
import { resolvePrimaryStructureVideo } from './travelBetweenImages/primaryStructureVideo';
import { resolveTravelStructureState } from './travelBetweenImages/structureState';

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

interface TravelContractData {
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

export interface ResolvedTravelStructureContractData {
  present: boolean;
  structureGuidance?: UnknownRecord;
  structureVideos: ReturnType<typeof resolveTravelStructureState>['structureVideos'];
  primaryStructureVideo: ReturnType<typeof resolvePrimaryStructureVideo>;
}

function pickFirstDefinedValue(
  reader: ReturnType<typeof createTravelPayloadReader>,
  keys: string[],
  sources: TravelPayloadSource[],
): unknown {
  for (const key of keys) {
    const value = reader.read(key, sources);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function pickRecord(reader: ReturnType<typeof createTravelPayloadReader>, key: string): UnknownRecord | undefined {
  const contractRecord = reader.pickRecord(key, CONTRACT_SOURCES);
  if (contractRecord) {
    return contractRecord;
  }
  const legacyRecord = reader.pickRecord(key, LEGACY_SOURCES);
  return legacyRecord;
}

export function buildTravelStructureSource(
  snapshot: TaskPayloadSnapshot,
): Record<string, unknown> {
  const reader = createTravelPayloadReader(snapshot);
  const structureGuidance = pickFirstDefinedValue(
    reader,
    ['structure_guidance', 'structureGuidance'],
    CONTRACT_THEN_LEGACY,
  );
  const guidanceVideos = asRecord(structureGuidance)?.videos;

  return {
    ...(structureGuidance !== undefined
      ? { structure_guidance: structureGuidance }
      : {}),
    ...(pickFirstDefinedValue(
      reader,
      ['structure_videos', 'structureVideos'],
      CONTRACT_THEN_LEGACY,
    ) !== undefined
      ? {
          structure_videos: pickFirstDefinedValue(
            reader,
            ['structure_videos', 'structureVideos'],
            CONTRACT_THEN_LEGACY,
          ),
        }
      : Array.isArray(guidanceVideos)
        ? { structure_videos: guidanceVideos }
        : {}),
    ...(pickFirstDefinedValue(
      reader,
      ['structure_video_path', 'structureVideoPath'],
      LEGACY_SOURCES,
    ) !== undefined
      ? {
          structure_video_path: pickFirstDefinedValue(
            reader,
            ['structure_video_path', 'structureVideoPath'],
            LEGACY_SOURCES,
          ),
        }
      : {}),
    ...(pickFirstDefinedValue(
      reader,
      ['structure_video_treatment', 'structureVideoTreatment'],
      LEGACY_SOURCES,
    ) !== undefined
      ? {
          structure_video_treatment: pickFirstDefinedValue(
            reader,
            ['structure_video_treatment', 'structureVideoTreatment'],
            LEGACY_SOURCES,
          ),
        }
      : {}),
    ...(pickFirstDefinedValue(
      reader,
      ['structure_video_type', 'structure_type', 'structureVideoType', 'structureType'],
      LEGACY_SOURCES,
    ) !== undefined
      ? {
          structure_video_type: pickFirstDefinedValue(
            reader,
            ['structure_video_type', 'structure_type', 'structureVideoType', 'structureType'],
            LEGACY_SOURCES,
          ),
        }
      : {}),
    ...(pickFirstDefinedValue(
      reader,
      ['structure_video_motion_strength', 'structureVideoMotionStrength'],
      LEGACY_SOURCES,
    ) !== undefined
      ? {
          structure_video_motion_strength: pickFirstDefinedValue(
            reader,
            ['structure_video_motion_strength', 'structureVideoMotionStrength'],
            LEGACY_SOURCES,
          ),
        }
      : {}),
    ...(pickFirstDefinedValue(
      reader,
      ['structure_canny_intensity', 'structureCannyIntensity'],
      LEGACY_SOURCES,
    ) !== undefined
      ? {
          structure_canny_intensity: pickFirstDefinedValue(
            reader,
            ['structure_canny_intensity', 'structureCannyIntensity'],
            LEGACY_SOURCES,
          ),
        }
      : {}),
    ...(pickFirstDefinedValue(
      reader,
      ['structure_depth_contrast', 'structureDepthContrast'],
      LEGACY_SOURCES,
    ) !== undefined
      ? {
          structure_depth_contrast: pickFirstDefinedValue(
            reader,
            ['structure_depth_contrast', 'structureDepthContrast'],
            LEGACY_SOURCES,
          ),
        }
      : {}),
    ...(pickFirstDefinedValue(
      reader,
      ['uni3c_start_percent', 'uni3cStartPercent'],
      LEGACY_SOURCES,
    ) !== undefined
      ? {
          uni3c_start_percent: pickFirstDefinedValue(
            reader,
            ['uni3c_start_percent', 'uni3cStartPercent'],
            LEGACY_SOURCES,
          ),
        }
      : {}),
    ...(pickFirstDefinedValue(
      reader,
      ['uni3c_end_percent', 'uni3cEndPercent'],
      LEGACY_SOURCES,
    ) !== undefined
      ? {
          uni3c_end_percent: pickFirstDefinedValue(
            reader,
            ['uni3c_end_percent', 'uni3cEndPercent'],
            LEGACY_SOURCES,
          ),
        }
      : {}),
    ...(pickFirstDefinedValue(
      reader,
      ['use_uni3c', 'useUni3c'],
      LEGACY_SOURCES,
    ) !== undefined
      ? {
          use_uni3c: pickFirstDefinedValue(
            reader,
            ['use_uni3c', 'useUni3c'],
            LEGACY_SOURCES,
          ),
        }
      : {}),
  };
}

export function readResolvedTravelStructure(
  snapshot: TaskPayloadSnapshot,
): ResolvedTravelStructureContractData {
  const source = buildTravelStructureSource(snapshot);
  const resolved = resolveTravelStructureState(source, {
    defaultEndFrame: 0,
    defaultVideoTreatment: DEFAULT_STRUCTURE_VIDEO.treatment,
    defaultMotionStrength: DEFAULT_STRUCTURE_GUIDANCE_CONTROLS.motionStrength,
    defaultStructureType: DEFAULT_STRUCTURE_GUIDANCE_CONTROLS.structureType,
    defaultUni3cEndPercent: DEFAULT_STRUCTURE_GUIDANCE_CONTROLS.uni3cEndPercent,
  });

  return {
    present: Object.keys(source).length > 0,
    structureGuidance: resolved.structureGuidance,
    structureVideos: resolved.structureVideos,
    primaryStructureVideo: resolvePrimaryStructureVideo(
      resolved.structureVideos,
      resolved.structureGuidance,
    ),
  };
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
