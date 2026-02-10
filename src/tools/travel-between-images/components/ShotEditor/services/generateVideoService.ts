import { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/shared/components/ui/sonner';
import { handleError } from '@/shared/lib/errorHandler';
import { getDisplayUrl } from '@/shared/lib/utils';
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
import {
  type LegacyStructureVideoConfig as StructureVideoConfig,
  DEFAULT_STRUCTURE_VIDEO_CONFIG,
} from '../hooks/useStructureVideo';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import { DEFAULT_RESOLUTION } from '../utils/dimension-utils';
import { DEFAULT_STEERABLE_MOTION_SETTINGS } from '../state/types';
import { PhaseConfig, buildBasicModePhaseConfig as buildPhaseConfigCore } from '../../../settings';
import { isVideoShotGenerations, type ShotGenerationsLike } from '@/shared/lib/typeGuards';
import {
  readSegmentOverrides,
  type SegmentOverrides,
} from '@/shared/utils/settingsMigration';
import { getGenerationId } from '@/shared/lib/mediaTypeHelpers';
import type { Shot } from '@/types/shots';

// Re-export types used by consumers (VideoGenerationModal, etc.)
export type { StructureVideoConfig, StitchConfig };
export { DEFAULT_STRUCTURE_VIDEO_CONFIG };

/** Strip 'mode' field from phaseConfig - backend determines mode from actual model */
const stripModeFromPhaseConfig = (config: PhaseConfig): PhaseConfig => {
  const { mode, ...rest } = config as PhaseConfig & { mode?: string };
  return rest as PhaseConfig;
};

/**
 * Extract segment overrides from metadata using migration utility.
 * Handles new format (segmentOverrides.*), old format (pair_*), and legacy (user_overrides).
 */
function extractPairOverrides(metadata: Record<string, unknown> | null | undefined): {
  overrides: SegmentOverrides;
  enhancedPrompt: string | undefined;
  legacyOverrides: Record<string, unknown>;
} {
  if (!metadata) {
    return { overrides: {}, enhancedPrompt: undefined, legacyOverrides: {} };
  }

  const overrides = readSegmentOverrides(metadata);
  const legacyOverrides = (metadata.user_overrides as Record<string, unknown>) || {};
  const enhancedPrompt = metadata.enhanced_prompt as string | undefined;

  return { overrides, enhancedPrompt, legacyOverrides };
}

/**
 * Build phase config for basic mode based on motion amount and user LoRAs.
 * Wraps the shared buildBasicModePhaseConfig, adding model selection.
 */
export function buildBasicModePhaseConfig(
  amountOfMotion: number,
  userLoras: Array<{ path: string; strength: number; lowNoisePath?: string; isMultiStage?: boolean }>,
): { model: string; phaseConfig: PhaseConfig } {
  const model = 'wan_2_2_i2v_lightning_baseline_2_2_2';
  const phaseConfig = buildPhaseConfigCore(false, amountOfMotion / 100, userLoras);
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
 * Handles both new multi-video array format and legacy single-video config.
 * Returns null if no structure video is configured.
 */
function buildStructureGuidance(
  structureVideos: StructureVideoConfigWithMetadata[] | undefined,
  structureVideoConfig: StructureVideoConfig,
  uni3cEndPercent: number | undefined,
  totalFrames: number,
): Record<string, unknown> | null {
  if (structureVideos && structureVideos.length > 0) {
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
        firstVideo.uni3c_end_percent ?? (uni3cEndPercent ?? 1.0),
      ];
      guidance.frame_policy = 'fit';
      guidance.zero_empty_frames = true;
    } else {
      guidance.preprocessing = PREPROCESSING_MAP[firstVideo.structure_type ?? 'flow'] ?? 'flow';
      if (firstVideo.canny_intensity != null) guidance.canny_intensity = firstVideo.canny_intensity;
      if (firstVideo.depth_contrast != null) guidance.depth_contrast = firstVideo.depth_contrast;
    }

    return guidance;
  }

  if (structureVideoConfig.structure_video_path) {
    const isUni3c = structureVideoConfig.structure_video_type === 'uni3c';
    const legacyUni3cEndPercent = structureVideoConfig.uni3c_end_percent ?? uni3cEndPercent ?? 1.0;

    const guidance: Record<string, unknown> = {
      target: isUni3c ? 'uni3c' : 'vace',
      videos: [{
        path: structureVideoConfig.structure_video_path,
        start_frame: 0,
        end_frame: totalFrames,
        treatment: structureVideoConfig.structure_video_treatment ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_treatment,
      }],
      strength: structureVideoConfig.structure_video_motion_strength ?? 1.0,
    };

    if (isUni3c) {
      guidance.step_window = [0, legacyUni3cEndPercent];
      guidance.frame_policy = 'fit';
      guidance.zero_empty_frames = true;
    } else {
      guidance.preprocessing = PREPROCESSING_MAP[structureVideoConfig.structure_video_type ?? 'flow'] ?? 'flow';
    }

    return guidance;
  }

  return null;
}

// ============================================================================

interface GenerateVideoParams {
  projectId: string;
  selectedShotId: string;
  selectedShot: Shot;
  queryClient: QueryClient;
  effectiveAspectRatio: string | null;
  generationMode: 'timeline' | 'batch';
  promptConfig: PromptConfig;
  motionConfig: MotionConfig;
  modelConfig: ModelConfig;
  /** Legacy single-video config (deprecated - use structureVideos instead) */
  structureVideoConfig: StructureVideoConfig;
  structureVideos?: StructureVideoConfigWithMetadata[];
  batchVideoFrames: number;
  selectedLoras: Array<{ id: string; path: string; strength: number; name: string }>;
  variantNameParam: string;
  clearAllEnhancedPrompts: () => Promise<void>;
  uni3cEndPercent?: number;
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
    structureVideoConfig,
    batchVideoFrames,
    selectedLoras,
    variantNameParam,
    clearAllEnhancedPrompts,
    parentGenerationId,
    stitchConfig,
  } = params;

  const {
    base_prompt: batchVideoPrompt,
    enhance_prompt: enhancePrompt,
    text_before_prompts: textBeforePrompts,
    text_after_prompts: textAfterPrompts,
    default_negative_prompt: defaultNegativePrompt,
  } = promptConfig;

  const {
    amount_of_motion: rawAmountOfMotion,
    motion_mode: motionMode,
    advanced_mode: advancedMode,
    phase_config: phaseConfig,
    selected_phase_preset_id: selectedPhasePresetId,
  } = motionConfig;

  const { seed, random_seed: randomSeed, turbo_mode: turboMode, debug } = modelConfig;

  // Ensure amountOfMotion has a valid default (destructuring default only applies when absent, not undefined)
  const amountOfMotion = rawAmountOfMotion ?? 50;

  if (!projectId) {
    toast.error('No project selected. Please select a project first.');
    return { success: false, error: 'No project selected' };
  }

  // Wait for pending mutations to complete before submitting (prevents stale data race conditions)
  const mutationCache = queryClient.getMutationCache();
  const pendingMutations = mutationCache.getAll().filter(m => m.state.status === 'pending');
  if (pendingMutations.length > 0) {
    await Promise.race([
      Promise.all(pendingMutations.map(m => m.state.promise?.catch(() => {}))),
      new Promise(resolve => setTimeout(resolve, 1000)),
    ]);
  }

  // ── Resolution ──────────────────────────────────────────────────────────
  // Priority: shot aspect ratio > project aspect ratio > default
  let resolution: string | undefined;
  if (selectedShot?.aspect_ratio) {
    resolution = ASPECT_RATIO_TO_RESOLUTION[selectedShot.aspect_ratio];
  }
  if (!resolution && effectiveAspectRatio) {
    resolution = ASPECT_RATIO_TO_RESOLUTION[effectiveAspectRatio];
  }
  if (!resolution) {
    resolution = DEFAULT_RESOLUTION;
  }

  // ── Fetch fresh shot generation data from DB ────────────────────────────
  // Single query used for both image URL extraction and timeline override extraction.
  // Query directly to avoid using stale React Query cache.
  let allShotGenerations: ShotGenRow[];

  try {
    const { data, error } = await supabase
      .from('shot_generations')
      .select(SHOT_GEN_QUERY)
      .eq('shot_id', selectedShotId)
      .order('timeline_frame', { ascending: true });

    if (error) {
      handleError(error, { context: 'TaskSubmission', toastTitle: 'Failed to fetch current images' });
      return { success: false, error: 'Failed to fetch shot data' };
    }

    allShotGenerations = (data || []) as ShotGenRow[];
  } catch (err) {
    handleError(err, { context: 'TaskSubmission', toastTitle: 'Failed to prepare task data' });
    return { success: false, error: 'Failed to prepare task data' };
  }

  // ── Extract image URLs and IDs from fetched data ────────────────────────
  const filteredForUrls = filterImageShotGenerations(allShotGenerations)
    .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));

  const freshImagesWithIds = filteredForUrls.map(shotGen => ({
    location: shotGen.generation?.location,
    generationId: shotGen.generation?.id || shotGen.generation_id,
    primaryVariantId: shotGen.generation?.primary_variant_id || undefined,
    shotGenerationId: shotGen.id,
  })).filter(item => Boolean(item.location));

  const absoluteImageUrls = freshImagesWithIds
    .map(item => getDisplayUrl(item.location))
    .filter((url): url is string => Boolean(url) && url !== '/placeholder.svg');

  const filteredImages = freshImagesWithIds.filter(item => {
    const url = getDisplayUrl(item.location);
    return Boolean(url) && url !== '/placeholder.svg';
  });

  const imageGenerationIds = filteredImages
    .map(item => item.generationId)
    .filter((id): id is string => Boolean(id));

  // Extract primary variant IDs for future-proofing (stored in task params for Load Images feature)
  const imageVariantIds = filteredImages
    .map(item => item.primaryVariantId)
    .filter((id): id is string => Boolean(id));

  // Each pair_shot_generation_id is the shot_generations.id of the START image of that pair
  const pairShotGenerationIds = filteredImages
    .slice(0, -1)
    .map(item => item.shotGenerationId)
    .filter((id): id is string => Boolean(id));

  // ── Per-pair overrides (timeline vs batch) ──────────────────────────────
  let basePrompts: string[];
  let segmentFrames: number[];
  let frameOverlap: number[];
  let negativePrompts: string[];
  let enhancedPromptsArray: string[] = [];
  let pairPhaseConfigsArray: (PhaseConfig | null)[] = [];
  let pairLorasArray: (Array<{ path: string; strength: number }> | null)[] = [];
  let pairMotionSettingsArray: (Record<string, unknown> | null)[] = [];

  if (generationMode === 'timeline') {
    // ── TIMELINE MODE: Extract per-pair overrides from fetched data ──────
    const pairPrompts: Record<number, { prompt: string; negativePrompt: string }> = {};
    const enhancedPrompts: Record<number, string> = {};
    const pairPhaseConfigsOverrides: Record<number, PhaseConfig> = {};
    const pairLorasOverrides: Record<number, Array<{ path: string; strength: number }>> = {};
    const pairMotionSettingsOverrides: Record<number, Record<string, unknown>> = {};
    const pairNumFramesOverrides: Record<number, number> = {};

    // Reuse the same data already fetched — filter to match absoluteImageUrls exactly
    const filteredShotGenerations = filterImageShotGenerations(allShotGenerations);

    // Build sorted positions for frame gap calculation
    const sortedPositions = filteredShotGenerations
      .filter(shotGen => shotGen.timeline_frame != null && shotGen.timeline_frame >= 0)
      .map(shotGen => ({
        id: getGenerationId(shotGen),
        pos: shotGen.timeline_frame!,
      }))
      .sort((a, b) => a.pos - b.pos);

    // Extract per-pair overrides from filtered data (indexes match actual image pairs)
    for (let i = 0; i < filteredShotGenerations.length - 1; i++) {
      const firstItem = filteredShotGenerations[i];
      const metadata = firstItem.metadata as Record<string, unknown> | null;
      const { overrides, enhancedPrompt, legacyOverrides } = extractPairOverrides(metadata);

      // Prompts
      if (overrides.prompt || overrides.negativePrompt) {
        pairPrompts[i] = {
          prompt: overrides.prompt || '',
          negativePrompt: overrides.negativePrompt || '',
        };
      }

      if (enhancedPrompt) {
        enhancedPrompts[i] = enhancedPrompt;
      }

      // Phase config (ignore stale phase_config when motion_mode is 'basic')
      const pairMotionMode = overrides.motionMode || legacyOverrides?.motion_mode;
      const isBasicMode = pairMotionMode === 'basic';

      if (!isBasicMode) {
        if (overrides.phaseConfig) {
          pairPhaseConfigsOverrides[i] = overrides.phaseConfig;
        } else if (legacyOverrides?.phase_config) {
          pairPhaseConfigsOverrides[i] = legacyOverrides.phase_config;
        }
      }

      // LoRAs
      if (overrides.loras && overrides.loras.length > 0) {
        pairLorasOverrides[i] = overrides.loras.map(lora => ({
          path: lora.path,
          strength: lora.strength,
        }));
      } else if (legacyOverrides?.additional_loras && Object.keys(legacyOverrides.additional_loras).length > 0) {
        pairLorasOverrides[i] = Object.entries(legacyOverrides.additional_loras).map(([path, strength]) => ({
          path,
          strength: typeof strength === 'number' ? strength : 1.0,
        }));
      }

      // Motion and structure settings
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
      } else if (legacyOverrides?.amount_of_motion !== undefined || legacyOverrides?.motion_mode !== undefined) {
        pairMotionSettingsOverrides[i] = {
          amount_of_motion: legacyOverrides.amount_of_motion,
          motion_mode: legacyOverrides.motion_mode,
        };
      }

      // Num frames
      if (overrides.numFrames !== undefined) {
        pairNumFramesOverrides[i] = overrides.numFrames;
      }
    }

    // Calculate frame gaps from sorted positions
    const frameGaps: number[] = [];
    for (let i = 0; i < sortedPositions.length - 1; i++) {
      frameGaps.push(sortedPositions[i + 1].pos - sortedPositions[i].pos);
    }

    // Build per-pair arrays from overrides
    basePrompts = frameGaps.length > 0
      ? frameGaps.map((_, index) => {
          // Empty string = backend uses base_prompt (singular)
          const pairPrompt = pairPrompts[index]?.prompt;
          return (pairPrompt && pairPrompt.trim()) ? pairPrompt.trim() : '';
        })
      : [''];

    segmentFrames = frameGaps.length > 0
      ? frameGaps.map((gap, index) => pairNumFramesOverrides[index] ?? gap)
      : [batchVideoFrames];

    frameOverlap = frameGaps.length > 0 ? frameGaps.map(() => 10) : [10];

    negativePrompts = frameGaps.length > 0
      ? frameGaps.map((_, index) => {
          const pairNeg = pairPrompts[index]?.negativePrompt;
          return (pairNeg && pairNeg.trim()) ? pairNeg.trim() : defaultNegativePrompt;
        })
      : [defaultNegativePrompt];

    enhancedPromptsArray = frameGaps.length > 0
      ? frameGaps.map((_, index) => enhancedPrompts[index] || '')
      : [];

    pairPhaseConfigsArray = frameGaps.length > 0
      ? frameGaps.map((_, index) => {
          const config = pairPhaseConfigsOverrides[index];
          return config ? stripModeFromPhaseConfig(config) : null;
        })
      : [];

    pairLorasArray = frameGaps.length > 0
      ? frameGaps.map((_, index) => pairLorasOverrides[index] || null)
      : [];

    pairMotionSettingsArray = frameGaps.length > 0
      ? frameGaps.map((_, index) => pairMotionSettingsOverrides[index] || null)
      : [];
  } else {
    // ── BATCH MODE: Uniform settings for all pairs ──────────────────────
    const numPairs = Math.max(0, absoluteImageUrls.length - 1);

    basePrompts = numPairs > 0 ? Array(numPairs).fill('') : [''];
    negativePrompts = numPairs > 0 ? Array(numPairs).fill(defaultNegativePrompt) : [defaultNegativePrompt];
    segmentFrames = numPairs > 0 ? Array(numPairs).fill(batchVideoFrames) : [batchVideoFrames];
    frameOverlap = numPairs > 0 ? Array(numPairs).fill(10) : [10];
    pairPhaseConfigsArray = numPairs > 0 ? Array(numPairs).fill(null) : [];
    pairLorasArray = numPairs > 0 ? Array(numPairs).fill(null) : [];
    pairMotionSettingsArray = numPairs > 0 ? Array(numPairs).fill(null) : [];
    enhancedPromptsArray = numPairs > 0 ? Array(numPairs).fill(null) : [];
  }

  // ── Model and phase config determination ────────────────────────────────
  let actualModelName: string;
  let effectivePhaseConfig: PhaseConfig;

  const userLorasForPhaseConfig = (selectedLoras || []).map(l => ({
    path: l.path,
    strength: parseFloat(l.strength?.toString() ?? '0') || 0.0,
    lowNoisePath: (l as { lowNoisePath?: string }).lowNoisePath,
    isMultiStage: (l as { isMultiStage?: boolean }).isMultiStage,
  }));

  // Use advanced mode only when explicitly enabled, phaseConfig exists, and motionMode isn't 'basic'
  const useAdvancedMode = advancedMode && phaseConfig && motionMode !== 'basic';

  if (useAdvancedMode) {
    actualModelName = phaseConfig.num_phases === 2
      ? 'wan_2_2_i2v_lightning_baseline_3_3'
      : 'wan_2_2_i2v_lightning_baseline_2_2_2';
    effectivePhaseConfig = phaseConfig;
  } else {
    const basicConfig = buildBasicModePhaseConfig(amountOfMotion, userLorasForPhaseConfig);
    actualModelName = basicConfig.model;
    effectivePhaseConfig = basicConfig.phaseConfig;
  }

  // Validate phase config consistency before sending
  {
    const phasesLength = effectivePhaseConfig.phases?.length || 0;
    const stepsLength = effectivePhaseConfig.steps_per_phase?.length || 0;
    const numPhases = effectivePhaseConfig.num_phases;

    if (numPhases !== phasesLength || numPhases !== stepsLength) {
      console.error('[Generation] Inconsistent phase config:', {
        num_phases: numPhases, phases_array_length: phasesLength, steps_array_length: stepsLength,
      });
      toast.error(`Invalid phase configuration: num_phases (${numPhases}) doesn't match arrays (phases: ${phasesLength}, steps: ${stepsLength}). Please reset to defaults.`);
      return { success: false, error: 'Invalid phase configuration' };
    }
  }

  // Only include enhanced_prompts if there are actual non-empty values
  const hasValidEnhancedPrompts = enhancedPromptsArray.some(p => p && p.trim().length > 0);

  // ── Build request body ──────────────────────────────────────────────────
  const requestBody: Record<string, unknown> = {
    project_id: projectId,
    shot_id: selectedShot.id,
    image_urls: absoluteImageUrls,
    ...(imageGenerationIds.length > 0 && imageGenerationIds.length === absoluteImageUrls.length
      ? { image_generation_ids: imageGenerationIds }
      : {}),
    ...(imageVariantIds.length > 0 && imageVariantIds.length === absoluteImageUrls.length
      ? { image_variant_ids: imageVariantIds }
      : {}),
    ...(pairShotGenerationIds.length > 0 ? { pair_shot_generation_ids: pairShotGenerationIds } : {}),
    ...(parentGenerationId ? { parent_generation_id: parentGenerationId } : {}),
    base_prompts: basePrompts,
    base_prompt: batchVideoPrompt,
    segment_frames: segmentFrames,
    frame_overlap: frameOverlap,
    negative_prompts: negativePrompts,
    ...(hasValidEnhancedPrompts ? { enhanced_prompts: enhancedPromptsArray } : {}),
    ...(pairPhaseConfigsArray.some(x => x !== null) ? { pair_phase_configs: pairPhaseConfigsArray } : {}),
    ...(pairLorasArray.some(x => x !== null) ? { pair_loras: pairLorasArray } : {}),
    ...(pairMotionSettingsArray.some(x => x !== null) ? { pair_motion_settings: pairMotionSettingsArray } : {}),
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

  // LoRAs are in phase_config for GPU worker processing.
  // Also send as separate loras array for orchestrator_details (segment regeneration).
  if (selectedLoras && selectedLoras.length > 0) {
    requestBody.loras = selectedLoras.map(l => ({
      path: l.path,
      strength: parseFloat(l.strength?.toString() ?? '1') || 1.0,
    }));
  }

  if (resolution) {
    requestBody.resolution = resolution;
  }

  if (stitchConfig) {
    requestBody.stitch_config = stitchConfig;
  }

  // Structure guidance (unified format with videos nested inside)
  const totalFrames = segmentFrames.reduce((a, b) => a + b, 0);
  const structureGuidance = buildStructureGuidance(
    params.structureVideos,
    structureVideoConfig,
    params.uni3cEndPercent,
    totalFrames,
  );
  if (structureGuidance) {
    requestBody.structure_guidance = structureGuidance;
  }

  // ── Submit task ─────────────────────────────────────────────────────────
  try {
    // Clear stale enhanced prompts when enhance_prompt is disabled
    if (!enhancePrompt) {
      try {
        await clearAllEnhancedPrompts();
      } catch (clearError) {
        handleError(clearError, { context: 'generateVideoService', showToast: false });
      }
    }

    const result = await createTravelBetweenImagesTask(requestBody as TravelBetweenImagesTaskParams);
    return { success: true, parentGenerationId: result.parentGenerationId };
  } catch (error) {
    const appError = handleError(error, { context: 'generateVideoService', toastTitle: 'Failed to create video generation task' });
    return { success: false, error: appError.message };
  }
}
