import { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { handleError, type HandleErrorOptions } from '@/shared/lib/errorHandling/handleError';
import { getDisplayUrl } from '@/shared/lib/mediaUrl';
import { ValidationError } from '@/shared/lib/errorHandling/errors';
import {
  createTravelBetweenImagesTask,
  type TravelBetweenImagesTaskParams,
  type PromptConfig,
  type MotionConfig,
  type ModelConfig,
  type StructureVideoConfigWithMetadata,
  type StitchConfig,
  DEFAULT_VIDEO_STRUCTURE_PARAMS,
} from '@/shared/lib/tasks/travelBetweenImages';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import { DEFAULT_RESOLUTION } from '../utils/dimension-utils';
import { DEFAULT_STEERABLE_MOTION_SETTINGS } from '../state/types';
import { PhaseConfig, buildBasicModePhaseConfig as buildPhaseConfigCore } from '../../../settings';
import { isVideoShotGenerations, type ShotGenerationsLike } from '@/shared/lib/typeGuards';
import {
  readSegmentOverrides,
  type SegmentOverrides,
} from '@/shared/lib/settingsMigration';
import type { Shot } from '@/types/shots';

// Re-export types used by consumers (VideoGenerationModal, etc.)
export type { StitchConfig };

/** Strip 'mode' field from phaseConfig - backend determines mode from actual model */
const stripModeFromPhaseConfig = (config: PhaseConfig): PhaseConfig => {
  const { mode, ...rest } = config as PhaseConfig & { mode?: string };
  return rest as PhaseConfig;
};

/**
 * Extract segment overrides from metadata using migration utility.
 * Legacy formats should be migrated before this service is called.
 */
function extractPairOverrides(metadata: Record<string, unknown> | null | undefined): {
  overrides: SegmentOverrides;
  enhancedPrompt: string | undefined;
} {
  if (!metadata) {
    return { overrides: {}, enhancedPrompt: undefined };
  }

  const overrides = readSegmentOverrides(metadata);
  const enhancedPrompt = metadata.enhanced_prompt as string | undefined;

  return { overrides, enhancedPrompt };
}

/**
 * Build phase config for basic mode based on motion amount and user LoRAs.
 * Wraps the shared buildBasicModePhaseConfig, adding model selection.
 */
export function buildBasicModeGenerationRequest(
  motionPercent: number,
  userLoras: Array<{ path: string; strength: number; lowNoisePath?: string; isMultiStage?: boolean }>,
): { model: string; phaseConfig: PhaseConfig } {
  const model = 'wan_2_2_i2v_lightning_baseline_2_2_2';
  const phaseConfig = buildPhaseConfigCore(false, motionPercent / 100, userLoras);
  return { model, phaseConfig };
}

// ============================================================================
// STRUCTURE GUIDANCE BUILDER
// ============================================================================

const PREPROCESSING_MAP: Record<string, string> = {
  'flow': 'flow', 'canny': 'canny', 'depth': 'depth', 'raw': 'none',
};

/**
 * Build unified structure_guidance object for the API request.
 * Uses the structure_videos array format.
 * Returns null if no structure video is configured.
 */
function buildStructureGuidance(
  structureVideos: StructureVideoConfigWithMetadata[] | undefined,
): Record<string, unknown> | null {
  if (!structureVideos || structureVideos.length === 0) {
    return null;
  }

  const firstVideo = structureVideos[0];
  const isUni3c = firstVideo.structure_type === 'uni3c';

  const cleanedVideos = structureVideos.map(video => ({
    path: video.path,
    start_frame: video.start_frame ?? 0,
    end_frame: video.end_frame ?? null,
    treatment: video.treatment ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_treatment,
    ...(video.metadata ? { metadata: video.metadata } : {}),
    ...(video.resource_id ? { resource_id: video.resource_id } : {}),
  }));

  const guidance: Record<string, unknown> = {
    target: isUni3c ? 'uni3c' : 'vace',
    videos: cleanedVideos,
    strength: firstVideo.motion_strength ?? 1.0,
  };

  if (isUni3c) {
    guidance.step_window = [
      firstVideo.uni3c_start_percent ?? 0,
      firstVideo.uni3c_end_percent ?? 1.0,
    ];
    guidance.frame_policy = 'fit';
    guidance.zero_empty_frames = true;
  } else {
    guidance.preprocessing = PREPROCESSING_MAP[firstVideo.structure_type ?? 'flow'] ?? 'flow';
    const videoRecord = firstVideo as unknown as Record<string, unknown>;
    const cannyIntensity = videoRecord.canny_intensity;
    const depthContrast = videoRecord.depth_contrast;
    if (typeof cannyIntensity === 'number') guidance.canny_intensity = cannyIntensity;
    if (typeof depthContrast === 'number') guidance.depth_contrast = depthContrast;
  }

  return guidance;
}

// ============================================================================

interface GenerateVideoParams {
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

interface GenerateVideoResult {
  success: boolean;
  error?: string;
  parentGenerationId?: string;
}

/** Shared Supabase query shape for shot_generations with joined generation data */
const SHOT_GEN_QUERY = `
  id,
  generation_id,
  timeline_frame,
  metadata,
  generation:generations!shot_generations_generation_id_generations_id_fk (
    id,
    location,
    type,
    primary_variant_id
  )
`;

type ShotGenRow = {
  id: string;
  generation_id: string | null;
  timeline_frame: number | null;
  metadata: Record<string, unknown> | null;
  generation: { id: string; location: string | null; type: string | null; primary_variant_id?: string | null } | null;
};

/** Filter shot_generations to positioned image rows with valid locations */
function filterImageShotGenerations(rows: ShotGenRow[]): ShotGenRow[] {
  return rows.filter(shotGen => {
    const hasValidLocation = shotGen.generation?.location && shotGen.generation.location !== '/placeholder.svg';
    return shotGen.generation &&
           shotGen.timeline_frame != null &&
           !isVideoShotGenerations(shotGen as ShotGenerationsLike) &&
           hasValidLocation;
  });
}

function failureResult(error: unknown, options: HandleErrorOptions): GenerateVideoResult {
  const appError = handleError(error, options);
  return { success: false, error: appError.message };
}

interface ImagePayload {
  absoluteImageUrls: string[];
  imageGenerationIds: string[];
  imageVariantIds: string[];
  pairShotGenerationIds: string[];
}

interface PairConfigPayload {
  basePrompts: string[];
  segmentFrames: number[];
  frameOverlap: number[];
  negativePrompts: string[];
  enhancedPromptsArray: Array<string | null>;
  pairPhaseConfigsArray: Array<PhaseConfig | null>;
  pairLorasArray: Array<Array<{ path: string; strength: number }> | null>;
  pairMotionSettingsArray: Array<Record<string, unknown> | null>;
}

interface ModelPhaseSelection {
  actualModelName: string;
  effectivePhaseConfig: PhaseConfig;
  useAdvancedMode: boolean;
}

function resolveGenerationResolution(selectedShot: Shot, effectiveAspectRatio: string | null): string {
  if (selectedShot?.aspect_ratio) {
    const shotResolution = ASPECT_RATIO_TO_RESOLUTION[selectedShot.aspect_ratio];
    if (shotResolution) return shotResolution;
  }
  if (effectiveAspectRatio) {
    const projectResolution = ASPECT_RATIO_TO_RESOLUTION[effectiveAspectRatio];
    if (projectResolution) return projectResolution;
  }
  return DEFAULT_RESOLUTION;
}

async function waitForPendingMutations(queryClient: QueryClient, timeoutMs = 5000): Promise<void> {
  if (queryClient.isMutating() === 0) return;

  const start = Date.now();
  while (queryClient.isMutating() > 0) {
    if (Date.now() - start > timeoutMs) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

async function fetchFreshShotGenerations(selectedShotId: string): Promise<ShotGenRow[]> {
  const { data, error } = await supabase
    .from('shot_generations')
    .select(SHOT_GEN_QUERY)
    .eq('shot_id', selectedShotId)
    .order('timeline_frame', { ascending: true });

  if (error) throw error;
  return (data || []) as ShotGenRow[];
}

function buildImagePayload(allShotGenerations: ShotGenRow[]): ImagePayload {
  const filteredForUrls = filterImageShotGenerations(allShotGenerations)
    .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));

  const freshImagesWithIds = filteredForUrls
    .map(shotGen => ({
      location: shotGen.generation?.location,
      generationId: shotGen.generation?.id || shotGen.generation_id,
      primaryVariantId: shotGen.generation?.primary_variant_id || undefined,
      shotGenerationId: shotGen.id,
    }))
    .filter(item => Boolean(item.location));

  const filteredImages = freshImagesWithIds.filter(item => {
    const url = getDisplayUrl(item.location);
    return Boolean(url) && url !== '/placeholder.svg';
  });

  return {
    absoluteImageUrls: filteredImages
      .map(item => getDisplayUrl(item.location))
      .filter((url): url is string => Boolean(url) && url !== '/placeholder.svg'),
    imageGenerationIds: filteredImages
      .map(item => item.generationId)
      .filter((id): id is string => Boolean(id)),
    imageVariantIds: filteredImages
      .map(item => item.primaryVariantId)
      .filter((id): id is string => Boolean(id)),
    pairShotGenerationIds: filteredImages
      .slice(0, -1)
      .map(item => item.shotGenerationId)
      .filter((id): id is string => Boolean(id)),
  };
}

function buildTimelinePairConfig(
  allShotGenerations: ShotGenRow[],
  batchVideoFrames: number,
  defaultNegativePrompt: string,
): PairConfigPayload {
  const pairPrompts: Record<number, { prompt: string; negativePrompt: string }> = {};
  const enhancedPrompts: Record<number, string> = {};
  const pairPhaseConfigsOverrides: Record<number, PhaseConfig> = {};
  const pairLorasOverrides: Record<number, Array<{ path: string; strength: number }>> = {};
  const pairMotionSettingsOverrides: Record<number, Record<string, unknown>> = {};
  const pairNumFramesOverrides: Record<number, number> = {};

  const filteredShotGenerations = filterImageShotGenerations(allShotGenerations);
  const sortedPositions = filteredShotGenerations
    .filter(shotGen => shotGen.timeline_frame != null && shotGen.timeline_frame >= 0)
    .map(shotGen => ({
      id: shotGen.generation?.id || shotGen.generation_id || shotGen.id,
      pos: shotGen.timeline_frame!,
    }))
    .sort((a, b) => a.pos - b.pos);

  for (let i = 0; i < filteredShotGenerations.length - 1; i++) {
    const firstItem = filteredShotGenerations[i];
    const metadata = firstItem.metadata as Record<string, unknown> | null;
    const { overrides, enhancedPrompt } = extractPairOverrides(metadata);

    if (overrides.prompt || overrides.negativePrompt) {
      pairPrompts[i] = {
        prompt: overrides.prompt || '',
        negativePrompt: overrides.negativePrompt || '',
      };
    }
    if (enhancedPrompt) enhancedPrompts[i] = enhancedPrompt;

    const isBasicMode = overrides.motionMode === 'basic';
    if (!isBasicMode && overrides.phaseConfig) {
      pairPhaseConfigsOverrides[i] = overrides.phaseConfig;
    }

    if (overrides.loras && overrides.loras.length > 0) {
      pairLorasOverrides[i] = overrides.loras.map(lora => ({
        path: lora.path,
        strength: lora.strength,
      }));
    }

    const hasMotionOverrides = overrides.motionMode !== undefined || overrides.amountOfMotion !== undefined;
    const hasStructureOverrides = overrides.structureMotionStrength !== undefined ||
      overrides.structureTreatment !== undefined ||
      overrides.structureUni3cEndPercent !== undefined;

    if (hasMotionOverrides || hasStructureOverrides) {
      pairMotionSettingsOverrides[i] = {
        ...(overrides.amountOfMotion !== undefined && { amount_of_motion: overrides.amountOfMotion / 100 }),
        ...(overrides.motionMode !== undefined && { motion_mode: overrides.motionMode }),
        ...(overrides.structureMotionStrength !== undefined && { structure_motion_strength: overrides.structureMotionStrength }),
        ...(overrides.structureTreatment !== undefined && { structure_treatment: overrides.structureTreatment }),
        ...(overrides.structureUni3cEndPercent !== undefined && { uni3c_end_percent: overrides.structureUni3cEndPercent }),
      };
    }

    if (overrides.numFrames !== undefined) {
      pairNumFramesOverrides[i] = overrides.numFrames;
    }
  }

  const frameGaps: number[] = [];
  for (let i = 0; i < sortedPositions.length - 1; i++) {
    frameGaps.push(sortedPositions[i + 1].pos - sortedPositions[i].pos);
  }

  return {
    basePrompts: frameGaps.length > 0
      ? frameGaps.map((_, index) => pairPrompts[index]?.prompt?.trim() || '')
      : [''],
    segmentFrames: frameGaps.length > 0
      ? frameGaps.map((gap, index) => pairNumFramesOverrides[index] ?? gap)
      : [batchVideoFrames],
    frameOverlap: frameGaps.length > 0 ? frameGaps.map(() => 10) : [10],
    negativePrompts: frameGaps.length > 0
      ? frameGaps.map((_, index) => pairPrompts[index]?.negativePrompt?.trim() || defaultNegativePrompt)
      : [defaultNegativePrompt],
    enhancedPromptsArray: frameGaps.length > 0
      ? frameGaps.map((_, index) => enhancedPrompts[index] || '')
      : [],
    pairPhaseConfigsArray: frameGaps.length > 0
      ? frameGaps.map((_, index) => pairPhaseConfigsOverrides[index] ? stripModeFromPhaseConfig(pairPhaseConfigsOverrides[index]) : null)
      : [],
    pairLorasArray: frameGaps.length > 0
      ? frameGaps.map((_, index) => pairLorasOverrides[index] || null)
      : [],
    pairMotionSettingsArray: frameGaps.length > 0
      ? frameGaps.map((_, index) => pairMotionSettingsOverrides[index] || null)
      : [],
  };
}

function buildBatchPairConfig(
  absoluteImageUrls: string[],
  batchVideoFrames: number,
  defaultNegativePrompt: string,
): PairConfigPayload {
  const numPairs = Math.max(0, absoluteImageUrls.length - 1);
  return {
    basePrompts: numPairs > 0 ? Array(numPairs).fill('') : [''],
    negativePrompts: numPairs > 0 ? Array(numPairs).fill(defaultNegativePrompt) : [defaultNegativePrompt],
    segmentFrames: numPairs > 0 ? Array(numPairs).fill(batchVideoFrames) : [batchVideoFrames],
    frameOverlap: numPairs > 0 ? Array(numPairs).fill(10) : [10],
    pairPhaseConfigsArray: numPairs > 0 ? Array(numPairs).fill(null) : [],
    pairLorasArray: numPairs > 0 ? Array(numPairs).fill(null) : [],
    pairMotionSettingsArray: numPairs > 0 ? Array(numPairs).fill(null) : [],
    enhancedPromptsArray: numPairs > 0 ? Array(numPairs).fill(null) : [],
  };
}

function resolveModelPhaseSelection(
  amountOfMotion: number,
  advancedMode: boolean,
  phaseConfig: PhaseConfig | undefined,
  motionMode: string,
  selectedLoras: GenerateVideoParams['selectedLoras'],
): ModelPhaseSelection {
  const userLorasForPhaseConfig = (selectedLoras || []).map(lora => ({
    path: lora.path,
    strength: parseFloat(lora.strength?.toString() ?? '0') || 0.0,
    lowNoisePath: (lora as { lowNoisePath?: string }).lowNoisePath,
    isMultiStage: (lora as { isMultiStage?: boolean }).isMultiStage,
  }));

  const useAdvancedMode = Boolean(advancedMode && phaseConfig && motionMode !== 'basic');
  if (useAdvancedMode && phaseConfig) {
    return {
      actualModelName: phaseConfig.num_phases === 2
        ? 'wan_2_2_i2v_lightning_baseline_3_3'
        : 'wan_2_2_i2v_lightning_baseline_2_2_2',
      effectivePhaseConfig: phaseConfig,
      useAdvancedMode,
    };
  }

  const basicConfig = buildBasicModeGenerationRequest(amountOfMotion, userLorasForPhaseConfig);
  return {
    actualModelName: basicConfig.model,
    effectivePhaseConfig: basicConfig.phaseConfig,
    useAdvancedMode: false,
  };
}

function validatePhaseConfigConsistency(config: PhaseConfig): void {
  const phasesLength = config.phases?.length || 0;
  const stepsLength = config.steps_per_phase?.length || 0;
  if (config.num_phases !== phasesLength || config.num_phases !== stepsLength) {
    throw new ValidationError(
      `Invalid phase configuration: num_phases (${config.num_phases}) does not match arrays (phases: ${phasesLength}, steps: ${stepsLength}).`,
    );
  }
}

interface MotionParams {
  amountOfMotion: number;
  motionMode: string;
  useAdvancedMode: boolean;
  effectivePhaseConfig: PhaseConfig;
  selectedPhasePresetId: string | null | undefined;
}

interface GenerationParams {
  generationMode: GenerateVideoParams['generationMode'];
  batchVideoPrompt: string;
  enhancePrompt: boolean;
  variantNameParam: string;
  textBeforePrompts: string | undefined;
  textAfterPrompts: string | undefined;
}

interface SeedParams {
  seed: number;
  randomSeed: boolean | undefined;
  turboMode: boolean | undefined;
  debug: boolean | undefined;
}

function buildTravelRequestBody(params: {
  projectId: string;
  selectedShot: Shot;
  imagePayload: ImagePayload;
  pairConfig: PairConfigPayload;
  parentGenerationId?: string;
  actualModelName: string;
  motionParams?: MotionParams;
  generationParams?: GenerationParams;
  seedParams?: SeedParams;
  // Backward-compat input fields (used by tests and older call sites).
  batchVideoPrompt?: string;
  enhancePrompt?: boolean;
  generationMode?: GenerateVideoParams['generationMode'];
  variantNameParam?: string;
  textBeforePrompts?: string | undefined;
  textAfterPrompts?: string | undefined;
  seed?: number;
  randomSeed?: boolean | undefined;
  turboMode?: boolean | undefined;
  debug?: boolean | undefined;
  amountOfMotion?: number;
  useAdvancedMode?: boolean;
  motionMode?: string;
  effectivePhaseConfig?: PhaseConfig;
  selectedPhasePresetId?: string | null | undefined;
}): Record<string, unknown> {
  const {
    projectId,
    selectedShot,
    imagePayload,
    pairConfig,
    parentGenerationId,
    actualModelName,
    motionParams,
    generationParams,
    seedParams,
  } = params;
  const resolvedMotionParams: MotionParams = motionParams ?? {
    amountOfMotion: params.amountOfMotion ?? 50,
    motionMode: params.motionMode ?? 'basic',
    useAdvancedMode: params.useAdvancedMode ?? false,
    effectivePhaseConfig: params.effectivePhaseConfig ?? buildBasicModeGenerationRequest(50, []).phaseConfig,
    selectedPhasePresetId: params.selectedPhasePresetId,
  };
  const resolvedGenerationParams: GenerationParams = generationParams ?? {
    generationMode: params.generationMode ?? 'timeline',
    batchVideoPrompt: params.batchVideoPrompt ?? '',
    enhancePrompt: params.enhancePrompt ?? false,
    variantNameParam: params.variantNameParam ?? '',
    textBeforePrompts: params.textBeforePrompts,
    textAfterPrompts: params.textAfterPrompts,
  };
  const resolvedSeedParams: SeedParams = seedParams ?? {
    seed: params.seed ?? 0,
    randomSeed: params.randomSeed,
    turboMode: params.turboMode,
    debug: params.debug,
  };
  const {
    amountOfMotion,
    motionMode,
    useAdvancedMode,
    effectivePhaseConfig,
    selectedPhasePresetId,
  } = resolvedMotionParams;
  const {
    generationMode,
    batchVideoPrompt,
    enhancePrompt,
    variantNameParam,
    textBeforePrompts,
    textAfterPrompts,
  } = resolvedGenerationParams;
  const {
    seed,
    randomSeed,
    turboMode,
    debug,
  } = resolvedSeedParams;

  const hasValidEnhancedPrompts = pairConfig.enhancedPromptsArray.some(prompt => prompt && prompt.trim().length > 0);

  return {
    project_id: projectId,
    shot_id: selectedShot.id,
    image_urls: imagePayload.absoluteImageUrls,
    ...(imagePayload.imageGenerationIds.length > 0 && imagePayload.imageGenerationIds.length === imagePayload.absoluteImageUrls.length
      ? { image_generation_ids: imagePayload.imageGenerationIds }
      : {}),
    ...(imagePayload.imageVariantIds.length > 0 && imagePayload.imageVariantIds.length === imagePayload.absoluteImageUrls.length
      ? { image_variant_ids: imagePayload.imageVariantIds }
      : {}),
    ...(imagePayload.pairShotGenerationIds.length > 0 ? { pair_shot_generation_ids: imagePayload.pairShotGenerationIds } : {}),
    ...(parentGenerationId ? { parent_generation_id: parentGenerationId } : {}),
    base_prompts: pairConfig.basePrompts,
    base_prompt: batchVideoPrompt,
    segment_frames: pairConfig.segmentFrames,
    frame_overlap: pairConfig.frameOverlap,
    negative_prompts: pairConfig.negativePrompts,
    ...(hasValidEnhancedPrompts ? { enhanced_prompts: pairConfig.enhancedPromptsArray } : {}),
    ...(pairConfig.pairPhaseConfigsArray.some(config => config !== null) ? { pair_phase_configs: pairConfig.pairPhaseConfigsArray } : {}),
    ...(pairConfig.pairLorasArray.some(loras => loras !== null) ? { pair_loras: pairConfig.pairLorasArray } : {}),
    ...(pairConfig.pairMotionSettingsArray.some(settings => settings !== null) ? { pair_motion_settings: pairConfig.pairMotionSettingsArray } : {}),
    model_name: actualModelName,
    model_type: 'i2v',
    seed,
    debug: debug ?? DEFAULT_STEERABLE_MOTION_SETTINGS.debug,
    show_input_images: DEFAULT_STEERABLE_MOTION_SETTINGS.show_input_images,
    enhance_prompt: enhancePrompt,
    generation_mode: generationMode,
    random_seed: randomSeed,
    turbo_mode: turboMode,
    amount_of_motion: amountOfMotion / 100.0,
    advanced_mode: useAdvancedMode,
    motion_mode: motionMode,
    phase_config: stripModeFromPhaseConfig(effectivePhaseConfig),
    regenerate_anchors: false,
    selected_phase_preset_id: selectedPhasePresetId || undefined,
    generation_name: variantNameParam.trim() || undefined,
    ...(textBeforePrompts ? { text_before_prompts: textBeforePrompts } : {}),
    ...(textAfterPrompts ? { text_after_prompts: textAfterPrompts } : {}),
    independent_segments: true,
    chain_segments: false,
    use_svi: false,
  };
}

// =============================================================================
// TEST-ONLY EXPORTS
// These internal functions are exported for unit testing.
// Consumers should use generateVideo() as the public API.
// =============================================================================
export {
  stripModeFromPhaseConfig as _stripModeFromPhaseConfig,
  extractPairOverrides as _extractPairOverrides,
  filterImageShotGenerations as _filterImageShotGenerations,
  resolveGenerationResolution as _resolveGenerationResolution,
  buildStructureGuidance as _buildStructureGuidance,
  buildTravelRequestBody as _buildTravelRequestBody,
};
export {
  buildImagePayload,
  buildTimelinePairConfig,
  buildBatchPairConfig,
  resolveModelPhaseSelection,
  validatePhaseConfigConsistency,
  buildBasicModeGenerationRequest as buildBasicModePhaseConfig,
};
export type { ShotGenRow, ImagePayload, PairConfigPayload, ModelPhaseSelection };

/**
 * Prepare and submit a video generation task.
 * Handles resolution, fresh DB queries, per-pair overrides, model selection,
 * structure guidance, and task creation.
 */
export async function generateVideo(params: GenerateVideoParams): Promise<GenerateVideoResult> {
  const {
    projectId,
    selectedShotId,
    selectedShot,
    queryClient,
    effectiveAspectRatio,
    generationMode,
    promptConfig,
    motionConfig,
    modelConfig,
    batchVideoFrames,
    selectedLoras,
    variantNameParam,
    clearAllEnhancedPrompts,
    parentGenerationId,
    stitchConfig,
    structureVideos,
  } = params;

  if (!projectId) {
    return failureResult(
      new ValidationError('No project selected. Please select a project first.', { field: 'projectId' }),
      { context: 'generateVideoService', toastTitle: 'No project selected' },
    );
  }

  await waitForPendingMutations(queryClient);
  const resolution = resolveGenerationResolution(selectedShot, effectiveAspectRatio);
  const amountOfMotion = motionConfig.amount_of_motion ?? 50;

  let allShotGenerations: ShotGenRow[];
  try {
    allShotGenerations = await fetchFreshShotGenerations(selectedShotId);
  } catch (error) {
    return failureResult(error, {
      context: 'TaskSubmission',
      toastTitle: 'Failed to fetch current images',
    });
  }

  const imagePayload = buildImagePayload(allShotGenerations);
  const pairConfig = generationMode === 'timeline'
    ? buildTimelinePairConfig(allShotGenerations, batchVideoFrames, promptConfig.default_negative_prompt)
    : buildBatchPairConfig(imagePayload.absoluteImageUrls, batchVideoFrames, promptConfig.default_negative_prompt);

  const modelPhaseSelection = resolveModelPhaseSelection(
    amountOfMotion,
    motionConfig.advanced_mode,
    motionConfig.phase_config,
    motionConfig.motion_mode,
    selectedLoras,
  );

  try {
    validatePhaseConfigConsistency(modelPhaseSelection.effectivePhaseConfig);
  } catch (error) {
    return failureResult(error, {
      context: 'generateVideoService',
      toastTitle: 'Invalid phase configuration',
    });
  }

  const requestBody = buildTravelRequestBody({
    projectId,
    selectedShot,
    imagePayload,
    pairConfig,
    parentGenerationId,
    actualModelName: modelPhaseSelection.actualModelName,
    motionParams: {
      amountOfMotion,
      motionMode: motionConfig.motion_mode,
      useAdvancedMode: modelPhaseSelection.useAdvancedMode,
      effectivePhaseConfig: modelPhaseSelection.effectivePhaseConfig,
      selectedPhasePresetId: motionConfig.selected_phase_preset_id,
    },
    generationParams: {
      generationMode,
      batchVideoPrompt: promptConfig.base_prompt,
      enhancePrompt: promptConfig.enhance_prompt,
      variantNameParam,
      textBeforePrompts: promptConfig.text_before_prompts,
      textAfterPrompts: promptConfig.text_after_prompts,
    },
    seedParams: {
      seed: modelConfig.seed,
      randomSeed: modelConfig.random_seed,
      turboMode: modelConfig.turbo_mode,
      debug: modelConfig.debug,
    },
  });

  if (selectedLoras && selectedLoras.length > 0) {
    requestBody.loras = selectedLoras.map(lora => ({
      path: lora.path,
      strength: parseFloat(lora.strength?.toString() ?? '1') || 1.0,
    }));
  }

  requestBody.resolution = resolution;
  if (stitchConfig) requestBody.stitch_config = stitchConfig;

  const structureGuidance = buildStructureGuidance(structureVideos);
  if (structureGuidance) requestBody.structure_guidance = structureGuidance;

  try {
    if (!promptConfig.enhance_prompt) {
      try {
        await clearAllEnhancedPrompts();
      } catch (clearError) {
        handleError(clearError, { context: 'generateVideoService', showToast: false });
      }
    }

    const result = await createTravelBetweenImagesTask(requestBody as unknown as TravelBetweenImagesTaskParams);
    return { success: true, parentGenerationId: result.parentGenerationId };
  } catch (error) {
    return failureResult(error, {
      context: 'generateVideoService',
      toastTitle: 'Failed to create video generation task',
    });
  }
}
