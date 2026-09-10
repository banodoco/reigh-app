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
import type { Shot } from '@/domains/generation/types';
import {
  operationFailure,
} from '@/shared/lib/operationResult';
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
  travelGenerationUnsupportedError,
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

/**
 * The travel producer is wired to the canonical capability boundary, but the
 * corresponding Runtime executor is not published yet. Keep this check before
 * every former persistence read/write, prompt side effect, or placeholder so a
 * legacy relationship cannot be revived accidentally.
 */
export async function generateVideo({ projectId }: GenerateVideoParams): Promise<GenerateVideoResult> {
  if (!projectId) {
    return failureResult(
      new ValidationError('No project selected. Please select a project first.', { field: 'projectId' }),
      { context: 'generateVideoService', toastTitle: 'No project selected' },
    );
  }

  return failureResult(
    travelGenerationUnsupportedError(),
    { context: 'generateVideoService', toastTitle: 'Travel generation is not yet supported' },
  );
}
