import { QueryClient } from '@tanstack/react-query';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { normalizeAndPresentError, type RuntimeErrorOptions } from '@/shared/lib/errorHandling/runtimeError';
import { getDisplayUrl } from '@/shared/lib/mediaUrl';
import { ValidationError } from '@/shared/lib/errorHandling/errors';
import {
  createTravelBetweenImagesTask,
  validateTravelBetweenImagesParams,
  type TravelBetweenImagesRequestPayload,
  type PromptConfig,
  type MotionConfig,
  type ModelConfig,
  type StructureVideoConfigWithMetadata,
  type StitchConfig,
  DEFAULT_VIDEO_STRUCTURE_PARAMS,
} from '@/shared/lib/tasks/travelBetweenImages';
import { normalizeStructureGuidance } from '@/shared/lib/tasks/structureGuidance';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/media/aspectRatios';
import { DEFAULT_RESOLUTION } from '../utils/dimension-utils';
import { DEFAULT_STEERABLE_MOTION_SETTINGS } from '../state/types';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import { isVideoAny } from '@/shared/lib/typeGuards';
import {
  readSegmentOverrides,
  type SegmentOverrides,
} from '@/shared/lib/settingsMigration';
import { buildMotionTaskFields, stripModeFromPhaseConfig } from '@/shared/components/segmentSettingsUtils';
import type { Shot } from '@/domains/generation/types';
import {
  operationFailure,
  operationSuccess,
  type OperationResult,
} from '@/shared/lib/operationResult';
import {
  buildBasicModeGenerationRequest,
  resolveModelPhaseSelection,
  validatePhaseConfigConsistency,
  type ModelPhaseSelection,
} from './generateVideo/modelPhase';

// Re-export types used by consumers (VideoGenerationModal, etc.)
export type { StitchConfig };

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

// ============================================================================
// STRUCTURE GUIDANCE BUILDER
// ============================================================================

/**
 * Build unified structure_guidance object for the API request.
 * Delegates to the canonical task-layer adapter so UI and task builders share one mapping contract.
 */
function buildStructureGuidance(
  structureVideos: StructureVideoConfigWithMetadata[] | undefined,
): Record<string, unknown> | null {
  const normalized = normalizeStructureGuidance({
    structureVideos,
    defaultVideoTreatment: DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_treatment,
    defaultUni3cEndPercent: 0.1,
  });
  return normalized ?? null;
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

interface GenerateVideoSuccessValue {
  parentGenerationId?: string;
}

type GenerateVideoResult = OperationResult<GenerateVideoSuccessValue>;

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
           !isVideoAny(shotGen) &&
           hasValidLocation;
  });
}

function failureResult(error: unknown, options: RuntimeErrorOptions): GenerateVideoResult {
  const appError = normalizeAndPresentError(error, options);
  return operationFailure(appError, {
    errorCode: 'generate_video_failed',
    policy: 'fail_closed',
    recoverable: true,
    message: appError.message,
    cause: {
      context: options.context,
      toastTitle: options.toastTitle,
      logData: options.logData,
    },
  });
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
  enhancedPromptsArray: string[];
  pairPhaseConfigsArray: Array<PhaseConfig | null>;
  pairLorasArray: Array<Array<{ path: string; strength: number }> | null>;
  pairMotionSettingsArray: Array<Record<string, unknown> | null>;
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
  const { data, error } = await supabase().from('shot_generations')
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
    enhancedPromptsArray: numPairs > 0 ? Array(numPairs).fill('') : [],
  };
}

function buildByPairConfig(
  allShotGenerations: ShotGenRow[],
  batchVideoFrames: number,
  defaultNegativePrompt: string,
): PairConfigPayload {
  const filteredShotGenerations = filterImageShotGenerations(allShotGenerations)
    .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
  const pairCount = Math.max(0, filteredShotGenerations.length - 1);

  if (pairCount === 0) {
    return {
      basePrompts: [''],
      segmentFrames: [batchVideoFrames],
      frameOverlap: [10],
      negativePrompts: [defaultNegativePrompt],
      enhancedPromptsArray: [],
      pairPhaseConfigsArray: [],
      pairLorasArray: [],
      pairMotionSettingsArray: [],
    };
  }

  const basePrompts: string[] = [];
  const segmentFrames: number[] = [];
  const frameOverlap: number[] = [];
  const negativePrompts: string[] = [];
  const enhancedPromptsArray: string[] = [];
  const pairPhaseConfigsArray: Array<PhaseConfig | null> = [];
  const pairLorasArray: Array<Array<{ path: string; strength: number }> | null> = [];
  const pairMotionSettingsArray: Array<Record<string, unknown> | null> = [];

  for (let i = 0; i < pairCount; i += 1) {
    const metadata = filteredShotGenerations[i]?.metadata as Record<string, unknown> | null;
    const { overrides, enhancedPrompt } = extractPairOverrides(metadata);

    basePrompts.push(overrides.prompt?.trim() || '');
    segmentFrames.push(overrides.numFrames ?? batchVideoFrames);
    frameOverlap.push(10);
    negativePrompts.push(overrides.negativePrompt?.trim() || defaultNegativePrompt);
    enhancedPromptsArray.push(enhancedPrompt || '');

    const isBasicMode = overrides.motionMode === 'basic';
    pairPhaseConfigsArray.push(!isBasicMode && overrides.phaseConfig ? stripModeFromPhaseConfig(overrides.phaseConfig) : null);
    pairLorasArray.push(
      overrides.loras?.length
        ? overrides.loras.map((lora) => ({ path: lora.path, strength: lora.strength }))
        : null,
    );

    const hasMotionOverrides = overrides.motionMode !== undefined || overrides.amountOfMotion !== undefined;
    const hasStructureOverrides = overrides.structureMotionStrength !== undefined
      || overrides.structureTreatment !== undefined
      || overrides.structureUni3cEndPercent !== undefined;
    pairMotionSettingsArray.push(
      (hasMotionOverrides || hasStructureOverrides)
        ? {
          ...(overrides.amountOfMotion !== undefined && { amount_of_motion: overrides.amountOfMotion / 100 }),
          ...(overrides.motionMode !== undefined && { motion_mode: overrides.motionMode }),
          ...(overrides.structureMotionStrength !== undefined && { structure_motion_strength: overrides.structureMotionStrength }),
          ...(overrides.structureTreatment !== undefined && { structure_treatment: overrides.structureTreatment }),
          ...(overrides.structureUni3cEndPercent !== undefined && { uni3c_end_percent: overrides.structureUni3cEndPercent }),
        }
        : null,
    );
  }

  return {
    basePrompts,
    segmentFrames,
    frameOverlap,
    negativePrompts,
    enhancedPromptsArray,
    pairPhaseConfigsArray,
    pairLorasArray,
    pairMotionSettingsArray,
  };
}

interface MotionParams {
  amountOfMotion: number;
  motionMode: MotionConfig['motion_mode'];
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

interface TravelRequestBodyV2Params {
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

function assertMappedIdCardinality(
  imagePayload: ImagePayload,
  expectedImageCount: number,
): void {
  if (imagePayload.imageGenerationIds.length > 0 && imagePayload.imageGenerationIds.length !== expectedImageCount) {
    throw new ValidationError(
      'Travel payload integrity check failed: image_generation_ids count does not match image_urls count.',
      { field: 'image_generation_ids' },
    );
  }

  if (imagePayload.imageVariantIds.length > 0 && imagePayload.imageVariantIds.length !== expectedImageCount) {
    throw new ValidationError(
      'Travel payload integrity check failed: image_variant_ids count does not match image_urls count.',
      { field: 'image_variant_ids' },
    );
  }

  const expectedPairCount = Math.max(0, expectedImageCount - 1);
  if (imagePayload.pairShotGenerationIds.length > 0 && imagePayload.pairShotGenerationIds.length !== expectedPairCount) {
    throw new ValidationError(
      'Travel payload integrity check failed: pair_shot_generation_ids count does not match pair count.',
      { field: 'pair_shot_generation_ids' },
    );
  }
}

function buildTravelRequestBodyV2(params: TravelRequestBodyV2Params): TravelBetweenImagesRequestPayload {
  const {
    projectId,
    selectedShot,
    imagePayload,
    pairConfig,
    parentGenerationId,
    actualModelName,
    generationTypeMode,
    motionParams,
    generationParams,
    seedParams,
  } = params;
  const {
    amountOfMotion,
    motionMode,
    useAdvancedMode,
    effectivePhaseConfig,
    selectedPhasePresetId,
  } = motionParams;
  const {
    generationMode,
    batchVideoPrompt,
    enhancePrompt,
    variantNameParam,
    textBeforePrompts,
    textAfterPrompts,
  } = generationParams;
  const {
    seed,
    randomSeed,
    turboMode,
    debug,
  } = seedParams;
  const imageCount = imagePayload.absoluteImageUrls.length;
  const expectedPairCount = Math.max(0, imageCount - 1);
  assertMappedIdCardinality(imagePayload, imageCount);

  const motionFields = buildMotionTaskFields({
    amountOfMotion,
    motionMode,
    phaseConfig: effectivePhaseConfig,
    selectedPhasePresetId,
    omitBasicPhaseConfig: true,
  });

  const hasValidEnhancedPrompts = pairConfig.enhancedPromptsArray.some(prompt => prompt && prompt.trim().length > 0);

  return {
    project_id: projectId,
    shot_id: selectedShot.id,
    image_urls: imagePayload.absoluteImageUrls,
    ...(imagePayload.imageGenerationIds.length > 0 && imagePayload.imageGenerationIds.length === imageCount
      ? { image_generation_ids: imagePayload.imageGenerationIds }
      : {}),
    ...(imagePayload.imageVariantIds.length > 0 && imagePayload.imageVariantIds.length === imageCount
      ? { image_variant_ids: imagePayload.imageVariantIds }
      : {}),
    ...(imagePayload.pairShotGenerationIds.length > 0 && imagePayload.pairShotGenerationIds.length === expectedPairCount
      ? { pair_shot_generation_ids: imagePayload.pairShotGenerationIds }
      : {}),
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
    model_type: generationTypeMode,
    seed,
    debug: debug ?? DEFAULT_STEERABLE_MOTION_SETTINGS.debug,
    show_input_images: DEFAULT_STEERABLE_MOTION_SETTINGS.show_input_images,
    enhance_prompt: enhancePrompt,
    generation_mode: generationMode,
    random_seed: randomSeed,
    turbo_mode: turboMode,
    ...motionFields,
    advanced_mode: useAdvancedMode,
    regenerate_anchors: false,
    generation_name: variantNameParam.trim() || undefined,
    ...(textBeforePrompts ? { text_before_prompts: textBeforePrompts } : {}),
    ...(textAfterPrompts ? { text_after_prompts: textAfterPrompts } : {}),
    independent_segments: true,
    chain_segments: false,
  };
}

// =============================================================================
// TEST-ONLY INTERNAL SURFACE
// Keep helper exports behind a single internal namespace so production
// consumers rely on generateVideo() as the stable module contract.
// =============================================================================
export const __internal = {
  stripModeFromPhaseConfig,
  extractPairOverrides,
  filterImageShotGenerations,
  resolveGenerationResolution,
  buildStructureGuidance,
  buildTravelRequestBodyV2,
  buildImagePayload,
  buildTimelinePairConfig,
  buildBatchPairConfig,
  buildByPairConfig,
  resolveModelPhaseSelection,
  validatePhaseConfigConsistency,
  buildBasicModePhaseConfig: buildBasicModeGenerationRequest,
} as const;
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
  const pairConfig = (() => {
    switch (generationMode) {
      case 'timeline':
        return buildTimelinePairConfig(allShotGenerations, batchVideoFrames, promptConfig.default_negative_prompt);
      case 'by-pair':
        return buildByPairConfig(allShotGenerations, batchVideoFrames, promptConfig.default_negative_prompt);
      case 'batch':
      default:
        return buildBatchPairConfig(imagePayload.absoluteImageUrls, batchVideoFrames, promptConfig.default_negative_prompt);
    }
  })();

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

  const requestBody = buildTravelRequestBodyV2({
    projectId,
    selectedShot,
    imagePayload,
    pairConfig,
    parentGenerationId,
    actualModelName: modelPhaseSelection.actualModelName,
    generationTypeMode: modelConfig.generation_type_mode,
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
    validateTravelBetweenImagesParams(requestBody);

    if (!promptConfig.enhance_prompt) {
      try {
        await clearAllEnhancedPrompts();
      } catch (clearError) {
        normalizeAndPresentError(clearError, { context: 'generateVideoService', showToast: false });
      }
    }

    const result = await createTravelBetweenImagesTask(requestBody);
    return operationSuccess(
      { parentGenerationId: result.parentGenerationId },
      { policy: 'best_effort' },
    );
  } catch (error) {
    return failureResult(error, {
      context: 'generateVideoService',
      toastTitle: 'Failed to create video generation task',
    });
  }
}
