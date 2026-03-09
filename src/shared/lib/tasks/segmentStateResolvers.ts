import { resolveSeed32Bit } from '../taskCreation';
import { buildBasicModePhaseConfig } from '@/shared/types/phaseConfig';
import { normalizeStructureGuidance } from '@/shared/lib/tasks/structureGuidance';
import {
  buildTaskPayloadSnapshot,
} from './taskPayloadSnapshot';
import { readTravelContractData } from './travelContractData';
import {
  asNumber,
  resolveNumberCandidate,
  resolveStringCandidate,
  toRecordOrEmpty,
  type UnknownRecord
} from './taskParamParsers';
import { asMotionMode, asPhaseConfig } from './segmentTypeCoercers';
import type {
  IndividualTravelSegmentParams,
  SegmentBuildState,
} from './individualTravelSegmentTypes';
import type { StructureVideoConfig } from './travelBetweenImages';

export const MAX_SEGMENT_FRAMES = 81;
const DEFAULT_I2V_MODEL = 'wan_2_2_i2v_lightning_baseline_2_2_2';

function sanitizeStructureVideosFromGuidance(
  structureGuidance: UnknownRecord | undefined,
): StructureVideoConfig[] | undefined {
  if (!Array.isArray(structureGuidance?.videos)) {
    return undefined;
  }

  const structureVideos = structureGuidance.videos
    .map((video) => {
      if (!video || typeof video !== 'object' || Array.isArray(video)) {
        return null;
      }

      const record = video as Record<string, unknown>;
      if (typeof record.path !== 'string') {
        return null;
      }

      return {
        path: record.path,
        start_frame: typeof record.start_frame === 'number' ? record.start_frame : 0,
        end_frame: typeof record.end_frame === 'number' ? record.end_frame : 0,
        treatment: record.treatment === 'clip' ? 'clip' : 'adjust',
        ...(typeof record.source_start_frame === 'number'
          ? { source_start_frame: record.source_start_frame }
          : {}),
        ...(record.source_end_frame === null || typeof record.source_end_frame === 'number'
          ? { source_end_frame: record.source_end_frame ?? null }
          : {}),
      } satisfies StructureVideoConfig;
    })
    .filter((video): video is StructureVideoConfig => video !== null);

  return structureVideos.length > 0 ? structureVideos : undefined;
}

function buildInputImages(params: IndividualTravelSegmentParams): string[] {
  return params.end_image_url
    ? [params.start_image_url, params.end_image_url]
    : [params.start_image_url];
}

function resolveFinalSeed(
  params: IndividualTravelSegmentParams,
  orig: UnknownRecord,
  orchDetails: UnknownRecord,
): number {
  const baseSeed = asNumber(orig.seed_to_use)
    ?? asNumber(orig.seed)
    ?? asNumber(orchDetails.seed_base)
    ?? 789;

  return resolveSeed32Bit({
    seed: params.seed,
    randomize: params.random_seed === true,
    fallbackSeed: baseSeed,
    field: 'seed',
  });
}

function mergeAdditionalLoraMap(
  target: Record<string, number>,
  source: unknown,
): void {
  const sourceRecord = toRecordOrEmpty(source);
  for (const [path, strength] of Object.entries(sourceRecord)) {
    if (typeof strength === 'number') {
      target[path] = strength;
    }
  }
}

function buildAdditionalLoras(
  params: IndividualTravelSegmentParams,
  orig: UnknownRecord,
  orchDetails: UnknownRecord,
  contractAdditionalLoras?: UnknownRecord,
): Record<string, number> {
  const additionalLoras: Record<string, number> = {};

  if (params.loras !== undefined) {
    for (const lora of params.loras) {
      additionalLoras[lora.path] = lora.strength;
    }
    return additionalLoras;
  }

  if (contractAdditionalLoras) {
    mergeAdditionalLoraMap(additionalLoras, contractAdditionalLoras);
  }
  mergeAdditionalLoraMap(additionalLoras, orig.additional_loras);
  if (Object.keys(additionalLoras).length === 0) {
    mergeAdditionalLoraMap(additionalLoras, orchDetails.additional_loras);
  }
  return additionalLoras;
}

function resolveStructureGuidance(
  params: IndividualTravelSegmentParams,
  orig: UnknownRecord,
  orchDetails: UnknownRecord,
  contractStructureGuidance?: UnknownRecord,
): UnknownRecord | undefined {
  return normalizeStructureGuidance({
    structureGuidance: params.structure_guidance ?? contractStructureGuidance ?? orig.structure_guidance ?? orchDetails.structure_guidance,
    structureVideos: params.structure_videos ?? orchDetails.structure_videos ?? orig.structure_videos,
    defaultVideoTreatment: 'adjust',
    defaultUni3cEndPercent: 0.1,
  });
}

export function buildSegmentState(params: IndividualTravelSegmentParams): SegmentBuildState {
  const snapshot = buildTaskPayloadSnapshot(params.originalParams);
  const contractData = readTravelContractData(snapshot);
  const orig = snapshot.rawParams;
  const orchDetails = snapshot.orchestratorDetails;
  const inputImages = buildInputImages(params);
  const allInputImages = contractData.inputImages ?? inputImages;
  const finalSeed = resolveFinalSeed(params, orig, orchDetails);
  const additionalLoras = buildAdditionalLoras(params, orig, orchDetails, contractData.additionalLoras);
  const motionMode = (
    params.motion_mode
    ?? asMotionMode(contractData.motionMode)
    ?? 'basic'
  );
  const amountOfMotion = params.amount_of_motion
    ?? contractData.amountOfMotion
    ?? 0.5;
  const explicitPhaseConfig = (
    params.phase_config
    ?? asPhaseConfig(contractData.phaseConfig)
  );
  const phaseConfig = explicitPhaseConfig
    ?? buildBasicModePhaseConfig(false, amountOfMotion, params.loras ?? []);
  const advancedMode = motionMode === 'basic'
    ? false
    : (
      params.advanced_mode
      ?? contractData.advancedMode
      ?? !!explicitPhaseConfig
    );
  const loraMultipliers = phaseConfig.phases.flatMap((phase) =>
    (phase.loras || []).map((lora) => ({
      url: lora.url,
      multiplier: typeof lora.multiplier === 'number' ? lora.multiplier : Number(lora.multiplier) || 0,
    })),
  );
  const modelName = contractData.modelName
    ?? DEFAULT_I2V_MODEL;
  const flowShift = resolveNumberCandidate(
    phaseConfig.flow_shift,
    orig.flow_shift,
    orchDetails.flow_shift,
  ) ?? 5;
  const sampleSolver = resolveStringCandidate(
    phaseConfig.sample_solver,
    orig.sample_solver,
    orchDetails.sample_solver,
  ) ?? 'euler';
  const guidanceScale = resolveNumberCandidate(
    phaseConfig.phases?.[0]?.guidance_scale,
    orig.guidance_scale,
    orchDetails.guidance_scale,
  ) ?? 1;
  const guidance2Scale = resolveNumberCandidate(
    phaseConfig.phases?.[1]?.guidance_scale,
    orig.guidance2_scale,
    orchDetails.guidance2_scale,
  ) ?? 1;
  const guidancePhases = resolveNumberCandidate(
    phaseConfig.num_phases,
    orig.guidance_phases,
    orchDetails.guidance_phases,
  ) ?? 2;
  const numInferenceSteps = phaseConfig.steps_per_phase
    ? phaseConfig.steps_per_phase.reduce((sum: number, steps: number) => sum + steps, 0)
    : (
      resolveNumberCandidate(orig.num_inference_steps, orchDetails.num_inference_steps)
      ?? 6
    );
  const modelSwitchPhase = resolveNumberCandidate(
    phaseConfig.model_switch_phase,
    orig.model_switch_phase,
    orchDetails.model_switch_phase,
  ) ?? 1;
  const switchThreshold = orig.switch_threshold ?? orchDetails.switch_threshold;
  const rawNumFrames = resolveNumberCandidate(params.num_frames, orig.num_frames) ?? 49;
  const numFrames = Math.min(rawNumFrames, MAX_SEGMENT_FRAMES);
  const basePrompt = resolveStringCandidate(
    params.base_prompt,
    contractData.prompt,
    orig.base_prompt,
    orig.prompt,
  ) ?? '';
  const negativePrompt = resolveStringCandidate(
    params.negative_prompt,
    contractData.negativePrompt,
  ) ?? '';
  const enhancedPrompt = resolveStringCandidate(
    params.enhanced_prompt,
    contractData.enhancedPrompt,
  );
  const fpsHelpers = resolveNumberCandidate(orig.fps_helpers, orchDetails.fps_helpers) ?? 16;
  const segmentFramesExpanded = contractData.segmentFramesExpanded;
  const frameOverlapExpanded = contractData.frameOverlapExpanded;
  const structureGuidance = resolveStructureGuidance(
    params,
    orig,
    orchDetails,
    contractData.structureGuidance,
  );
  const structureVideos = sanitizeStructureVideosFromGuidance(structureGuidance);

  return {
    orig,
    orchDetails,
    inputImages,
    allInputImages,
    finalSeed,
    additionalLoras,
    motionMode,
    amountOfMotion,
    phaseConfig,
    advancedMode,
    loraMultipliers,
    modelName,
    flowShift,
    sampleSolver,
    guidanceScale,
    guidance2Scale,
    guidancePhases,
    numInferenceSteps,
    modelSwitchPhase,
    switchThreshold,
    numFrames,
    basePrompt,
    negativePrompt,
    enhancedPrompt,
    fpsHelpers,
    segmentFramesExpanded,
    frameOverlapExpanded,
    structureGuidance,
    structureVideos,
  };
}
