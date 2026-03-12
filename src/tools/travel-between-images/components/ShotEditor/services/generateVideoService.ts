import { QueryClient } from '@tanstack/react-query';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { normalizeAndPresentError, type RuntimeErrorOptions } from '@/shared/lib/errorHandling/runtimeError';
import { ValidationError } from '@/shared/lib/errorHandling/errors';
import {
  createTravelBetweenImagesTaskWithParentGeneration,
  validateTravelBetweenImagesParams,
  DEFAULT_STRUCTURE_GUIDANCE_CONTROLS,
  DEFAULT_STRUCTURE_VIDEO,
} from '@/shared/lib/tasks/travelBetweenImages';
import { normalizeStructureGuidance } from '@/shared/lib/tasks/structureGuidance';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/media/aspectRatios';
import { DEFAULT_RESOLUTION } from '../utils/dimension-utils';
import { stripModeFromPhaseConfig } from '@/shared/components/SegmentSettingsForm/segmentSettingsUtils';
import type { Shot } from '@/domains/generation/types';
import {
  operationFailure,
  operationSuccess,
} from '@/shared/lib/operationResult';
import {
  buildBasicModeGenerationRequest,
  resolveModelPhaseSelection,
  validatePhaseConfigConsistency,
} from './generateVideo/modelPhase';
import {
  buildImagePayload,
  buildTimelinePairConfig,
  buildBatchPairConfig,
  buildByPairConfig,
  extractPairOverrides,
  filterImageShotGenerations,
} from './generateVideo/pairPayload';
import { buildTravelRequestBodyV2 } from './generateVideo/requestBody';
import type {
  GenerateVideoParams,
  GenerateVideoResult,
  ShotGenRow,
  ImagePayload,
  PairConfigPayload,
  ModelPhaseSelection,
} from './generateVideo/types';
import type {
  StructureVideoConfigWithMetadata,
  StitchConfig,
} from '@/shared/lib/tasks/travelBetweenImages';

export type { StitchConfig };

/**
 * Build unified structure_guidance object for the API request.
 * Delegates to the canonical task-layer adapter so UI and task builders share one mapping contract.
 */
function buildStructureGuidance(
  structureGuidanceOrVideos: Record<string, unknown> | StructureVideoConfigWithMetadata[] | undefined,
  structureVideosArg?: StructureVideoConfigWithMetadata[] | undefined,
): Record<string, unknown> | null {
  const structureGuidance = Array.isArray(structureGuidanceOrVideos)
    ? undefined
    : structureGuidanceOrVideos;
  const structureVideos = Array.isArray(structureGuidanceOrVideos)
    ? structureGuidanceOrVideos
    : structureVideosArg;

  if (structureGuidance) {
    return structureGuidance;
  }
  const normalized = normalizeStructureGuidance({
    structureVideos,
    defaultVideoTreatment: DEFAULT_STRUCTURE_VIDEO.treatment,
    defaultUni3cEndPercent: DEFAULT_STRUCTURE_GUIDANCE_CONTROLS.uni3cEndPercent,
  });
  return normalized ?? null;
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
    structureGuidance,
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

  const normalizedStructureGuidance = buildStructureGuidance(
    structureGuidance as Record<string, unknown> | undefined,
    structureVideos,
  );
  if (normalizedStructureGuidance) requestBody.structure_guidance = normalizedStructureGuidance;

  try {
    validateTravelBetweenImagesParams(requestBody);

    if (!promptConfig.enhance_prompt) {
      try {
        await clearAllEnhancedPrompts();
      } catch (clearError) {
        normalizeAndPresentError(clearError, { context: 'generateVideoService', showToast: false });
      }
    }

    const result = await createTravelBetweenImagesTaskWithParentGeneration(requestBody);
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
