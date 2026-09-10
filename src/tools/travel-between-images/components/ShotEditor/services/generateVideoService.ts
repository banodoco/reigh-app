import { normalizeAndPresentError, type RuntimeErrorOptions } from '@/shared/lib/errorHandling/runtimeError';
import { ValidationError } from '@/shared/lib/errorHandling/errors';
import {
  DEFAULT_STRUCTURE_GUIDANCE_CONTROLS,
  DEFAULT_STRUCTURE_VIDEO,
} from '@/shared/lib/tasks/travelBetweenImages';
import { normalizeStructureGuidance } from '@/shared/lib/tasks/structureGuidance';
import { ASPECT_RATIO_TO_RESOLUTION, LTX_ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/media/aspectRatios';
import { DEFAULT_RESOLUTION } from '../utils/dimension-utils';
import { stripModeFromPhaseConfig } from '@/shared/components/SegmentSettingsForm/segmentSettingsUtils';
import type { GenerationRow, Shot } from '@/domains/generation/types';
import {
  operationFailure,
  operationSuccess,
} from '@/shared/lib/operationResult';
import { queryKeys } from '@/shared/lib/queryKeys';
import { getDisplayUrl } from '@/shared/lib/media/mediaUrl';
import { MODEL_DEFAULTS } from '@/tools/travel-between-images/settings';
import { buildBasicModeGenerationRequest, resolveLtxModelSelection, resolveModelPhaseSelection, validatePhaseConfigConsistency } from './generateVideo/modelPhase';
import {
  buildImagePayload,
  buildTimelinePairConfig,
  buildBatchPairConfig,
  buildByPairConfig,
  extractPairOverrides,
  filterImageShotGenerations,
} from './generateVideo/pairPayload';
import { buildTravelRequestBodyV2 } from './generateVideo/requestBody';
import {
  createTravelGenerationTask,
  TRAVEL_GENERATION_MODEL,
} from '@/shared/lib/taskCreation/travelGeneration';
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
 * Build legacy structure-guidance data when older internal consumers still need it.
 * New task writes should go through canonical `travel_guidance`.
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

function resolveGenerationResolution(
  selectedShot: Shot,
  effectiveAspectRatio: string | null,
  useLtxHd: boolean = false,
): string {
  const resolutionMap = useLtxHd ? LTX_ASPECT_RATIO_TO_RESOLUTION : ASPECT_RATIO_TO_RESOLUTION;
  if (selectedShot?.aspect_ratio) {
    const shotResolution = resolutionMap[selectedShot.aspect_ratio];
    if (shotResolution) return shotResolution;
  }
  if (effectiveAspectRatio) {
    const projectResolution = resolutionMap[effectiveAspectRatio];
    if (projectResolution) return projectResolution;
  }
  return useLtxHd ? '1280x720' : DEFAULT_RESOLUTION;
}

export {
  stripModeFromPhaseConfig,
  extractPairOverrides,
  filterImageShotGenerations,
  buildTravelRequestBodyV2,
  buildImagePayload,
  buildTimelinePairConfig,
  buildBatchPairConfig,
  buildByPairConfig,
  resolveLtxModelSelection,
  resolveModelPhaseSelection,
  validatePhaseConfigConsistency,
  buildBasicModeGenerationRequest as buildBasicModePhaseConfig,
};
export { resolveGenerationResolution, buildStructureGuidance };
export type { ShotGenRow, ImagePayload, PairConfigPayload, ModelPhaseSelection };

function cachedRowsAsShotGenerationRows(rows: GenerationRow[]): ShotGenRow[] {
  return rows.map((row) => ({
    id: row.id,
    generation_id: row.generation_id ?? null,
    timeline_frame: row.timeline_frame ?? null,
    metadata: (row.metadata as Record<string, unknown> | null | undefined) ?? null,
    generation: {
      id: row.generation_id ?? row.id,
      location: row.location ?? row.imageUrl ?? null,
      type: row.type ?? null,
      primary_variant_id: row.primary_variant_id ?? null,
    },
  }));
}

/** Admit one bounded first/last-frame travel pair through canonical Runtime. */
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
    selectedLoras,
    variantNameParam,
    travelGuidance,
    structureGuidance,
    structureVideos,
    stitchConfig,
    parentGenerationId,
  } = params;
  if (!projectId) {
    return failureResult(
      new ValidationError('No project selected. Please select a project first.', { field: 'projectId' }),
      { context: 'generateVideoService', toastTitle: 'No project selected' },
    );
  }

  try {
    if (!selectedShotId) throw new ValidationError('No shot selected.', { field: 'selectedShotId' });
    if (modelConfig.selectedModel !== TRAVEL_GENERATION_MODEL) {
      throw new ValidationError(
        'The bounded Astrid travel profile currently supports wan-2.2 first/last-frame generation only.',
        { field: 'model' },
      );
    }
    if (promptConfig.enhance_prompt) {
      throw new ValidationError(
        'Prompt enhancement is not part of the bounded canonical travel profile.',
        { field: 'enhance_prompt' },
      );
    }
    if (selectedLoras.length > 0 || motionConfig.advanced_mode || modelConfig.smoothContinuations) {
      throw new ValidationError(
        'LoRAs, advanced phase controls, and continuation are not part of the bounded canonical travel profile.',
        { field: 'controls' },
      );
    }
    if (travelGuidance || structureGuidance || (structureVideos?.length ?? 0) > 0 || stitchConfig || parentGenerationId) {
      throw new ValidationError(
        'Guidance, stitching, and legacy parent-generation controls are not part of the bounded canonical travel profile.',
        { field: 'controls' },
      );
    }
    if (variantNameParam.trim()) {
      throw new ValidationError(
        'Variant naming is not part of the bounded canonical travel profile.',
        { field: 'variantNameParam' },
      );
    }

    const cachedRows = queryClient.getQueryData<GenerationRow[]>(queryKeys.generations.byShot(selectedShotId));
    if (!cachedRows) {
      throw new ValidationError(
        'Current shot images are not loaded; refresh the shot before submitting travel generation.',
        { field: 'selectedShotId' },
      );
    }
    const shotRows = cachedRowsAsShotGenerationRows(cachedRows);
    const positionedRows = filterImageShotGenerations(shotRows)
      .sort((left, right) => (left.timeline_frame ?? 0) - (right.timeline_frame ?? 0));
    if (positionedRows.length !== 2) {
      throw new ValidationError(
        'The bounded canonical travel profile admits exactly one adjacent image pair; select exactly two positioned images.',
        { field: 'input_object_ids' },
      );
    }
    const imagePayload = buildImagePayload(positionedRows);
    const pairConfig = generationMode === 'timeline'
      ? buildTimelinePairConfig(positionedRows, params.batchVideoFrames, promptConfig.default_negative_prompt)
      : generationMode === 'by-pair'
        ? buildByPairConfig(positionedRows, params.batchVideoFrames, promptConfig.default_negative_prompt)
        : buildBatchPairConfig(imagePayload.absoluteImageUrls, params.batchVideoFrames, promptConfig.default_negative_prompt);
    const prompt = pairConfig.basePrompts[0]?.trim() || promptConfig.base_prompt.trim();
    const source = positionedRows[0];
    const sourceUrl = getDisplayUrl(source.generation?.location);
    const endUrl = getDisplayUrl(positionedRows[1].generation?.location);
    if (!sourceUrl || !endUrl) throw new ValidationError('Both positioned images must have usable media URLs.', { field: 'input_object_ids' });
    const task = await createTravelGenerationTask({
      project: projectId,
      startUrl: sourceUrl,
      endUrl,
      prompt,
      negativePrompt: pairConfig.negativePrompts[0],
      model: TRAVEL_GENERATION_MODEL,
      execution: 'cloud',
      frames: pairConfig.segmentFrames[0] ?? params.batchVideoFrames,
      fps: MODEL_DEFAULTS[TRAVEL_GENERATION_MODEL].fps,
      resolution: resolveGenerationResolution(selectedShot, effectiveAspectRatio),
      guidanceScale: modelConfig.guidance_scale,
      steps: modelConfig.num_inference_steps,
      seed: modelConfig.random_seed ? undefined : modelConfig.seed,
      basedOnGenerationId: source.generation_id ?? undefined,
      sourceVariantId: source.generation?.primary_variant_id,
    });
    const taskIds = task.task_ids ?? [task.task_id];
    return operationSuccess({ taskId: task.task_id, taskIds }, { policy: 'fail_closed' });
  } catch (error) {
    return failureResult(error, {
      context: 'generateVideoService',
      toastTitle: 'Failed to create canonical travel video task',
    });
  }
}
