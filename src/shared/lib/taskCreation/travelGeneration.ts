import { AstridLocalClient } from '@/integrations/astrid/client';
import { runtimeSha256IdSchema } from '@/tools/video-editor/data/bridgeContract';
import { unsupportedCapabilityError } from './legacyBoundary';
import { createTask, ingestProjectInputFromUrl, resolveTaskCapability } from './createTask';
import { TaskValidationError, type TaskCreationResult } from './types';

/** Bounded travel capability: one canonical first/last-frame task per pair. */
export const TRAVEL_GENERATION_CAPABILITY_ID = 'generation.generate_video';
export const TRAVEL_GENERATION_MODEL = 'wan-2.2';
export const TRAVEL_GENERATION_EXECUTION = 'cloud';
export const TRAVEL_GENERATION_MODE = 'flf';
export const TRAVEL_GENERATION_UNSUPPORTED_REASON =
  'the published travel profile currently admits one ordered first/last-frame pair per task';

export interface TravelGenerationTaskOptions {
  project: string;
  startUrl: string;
  endUrl: string;
  prompt: string;
  negativePrompt?: string;
  model?: typeof TRAVEL_GENERATION_MODEL;
  execution?: typeof TRAVEL_GENERATION_EXECUTION;
  frames: number;
  fps?: number;
  duration?: number;
  resolution?: string;
  guidanceScale?: number;
  steps?: number;
  seed?: number;
  basedOnGenerationId?: string;
  sourceVariantId?: string | null;
}

export type TravelGenerationAdmissionRequest = TravelGenerationTaskOptions;

function requireFiniteInteger(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new TaskValidationError(`${field} must be an integer from ${min} through ${max}`, field);
  }
  return value;
}

function requireOptionalFiniteNumber(value: unknown, field: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new TaskValidationError(`${field} must be a finite number from ${min} through ${max}`, field);
  }
  return value;
}

async function resolveTravelLineage(
  project: string,
  generationId: string,
  requestedVariantId?: string | null,
): Promise<{ generationId: string; expectedVersion: number; sourceVariantId: string; sourceObjectId: string }> {
  const detail = await new AstridLocalClient({ projectSlug: project }).gallery.get(generationId);
  const expectedVersion = detail.version;
  if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new TaskValidationError(
      'Astrid source generation has no usable version for atomic travel settlement',
      'lineage',
    );
  }
  const sourceVariant = requestedVariantId
    ? detail.variants.find((variant) => variant.id === requestedVariantId)
    : detail.variants.find((variant) => variant.is_primary) ?? detail.variants[0];
  if (!sourceVariant) {
    throw new TaskValidationError(
      'Astrid source generation has no variant for atomic travel settlement',
      'lineage',
    );
  }
  if (!runtimeSha256IdSchema.safeParse(sourceVariant.object_id).success) {
    throw new TaskValidationError(
      'Astrid source variant has no CAS object identity for atomic travel settlement',
      'lineage',
    );
  }
  return {
    generationId,
    expectedVersion,
    sourceVariantId: sourceVariant.id,
    sourceObjectId: sourceVariant.object_id,
  };
}

/**
 * Admit one ordered image pair through Astrid's existing first/last-frame
 * executor. Both image bytes are ingested before task admission and bound to
 * the executor's ordered CAS ports; no URL remains authoritative.
 */
export async function createTravelGenerationTask(
  options: TravelGenerationAdmissionRequest,
): Promise<TaskCreationResult> {
  if (options.model !== undefined && options.model !== TRAVEL_GENERATION_MODEL) {
    throw new TaskValidationError(
      `Travel generation model ${options.model} is not represented by the published bounded FLF profile`,
      'model',
    );
  }
  if (options.execution !== undefined && options.execution !== TRAVEL_GENERATION_EXECUTION) {
    throw new TaskValidationError(
      'The published bounded travel profile supports cloud execution only',
      'execution',
    );
  }
  if (!options.prompt.trim()) {
    throw new TaskValidationError('Travel generation prompt must be non-empty', 'prompt');
  }
  const frames = requireFiniteInteger(options.frames, 'frames', 1, 4096);
  const fps = requireOptionalFiniteNumber(options.fps, 'fps', 1, 120);
  const duration = requireOptionalFiniteNumber(options.duration, 'duration', 0.1, 120);
  const guidanceScale = requireOptionalFiniteNumber(options.guidanceScale, 'guidanceScale', 0, 100);
  const steps = options.steps === undefined ? undefined : requireFiniteInteger(options.steps, 'steps', 1, 1000);
  const seed = options.seed === undefined ? undefined : requireFiniteInteger(options.seed, 'seed', 0, 2_147_483_647);
  if (!options.startUrl.trim() || !options.endUrl.trim()) {
    throw new TaskValidationError('Travel generation requires start and end image URLs', 'input_object_ids');
  }
  if (options.startUrl === options.endUrl) {
    throw new TaskValidationError('Travel generation requires distinct start and end image URLs', 'input_object_ids');
  }
  if (options.basedOnGenerationId === undefined) {
    throw new TaskValidationError(
      'Travel generation requires a source generation for atomic variant settlement',
      'lineage',
    );
  }

  const capability = await resolveTaskCapability(options.project, TRAVEL_GENERATION_CAPABILITY_ID);
  if (capability.estimated_scratch_bytes <= 0 || capability.estimated_output_bytes <= 0) {
    throw new TaskValidationError(
      'Astrid video capability has no nonzero storage estimate; travel admission is blocked',
      'storage_estimate',
    );
  }
  const lineage = await resolveTravelLineage(options.project, options.basedOnGenerationId, options.sourceVariantId);
  const [start, end] = await Promise.all([
    ingestProjectInputFromUrl(options.project, options.startUrl, { maxBytes: 8 * 1024 * 1024, requireImage: true }),
    ingestProjectInputFromUrl(options.project, options.endUrl, { maxBytes: 8 * 1024 * 1024, requireImage: true }),
  ]);
  if (!start.media_type.startsWith('image/') || !end.media_type.startsWith('image/')) {
    throw new TaskValidationError('Travel generation inputs must be images', 'input_object_ids');
  }
  if (start.object_id === end.object_id) {
    throw new TaskValidationError('Travel generation inputs must be distinct CAS objects', 'input_object_ids');
  }
  if (start.object_id !== lineage.sourceObjectId) {
    throw new TaskValidationError(
      'Selected Astrid source variant does not match the admitted start-image bytes',
      'lineage',
    );
  }

  return createTask({
    project: options.project,
    capability_id: TRAVEL_GENERATION_CAPABILITY_ID,
    capability_digest: capability.definition_digest,
    schema_version: '1',
    input_object_ids: [start.object_id, end.object_id],
    spec: {
      family: TRAVEL_GENERATION_CAPABILITY_ID,
      params: {
        model: TRAVEL_GENERATION_MODEL,
        mode: TRAVEL_GENERATION_MODE,
        execution: TRAVEL_GENERATION_EXECUTION,
        prompt: options.prompt.trim(),
        count: 1,
        image_ref: { digest: start.object_id, filename: start.filename, media_type: start.media_type },
        image_end_ref: { digest: end.object_id, filename: end.filename, media_type: end.media_type },
        ...(options.negativePrompt?.trim() ? { negative_prompt: options.negativePrompt.trim() } : {}),
        ...(options.resolution ? { resolution: options.resolution } : {}),
        ...(fps !== undefined ? { fps } : {}),
        ...(duration !== undefined ? { duration } : {}),
        frames,
        ...(guidanceScale !== undefined ? { guidance_scale: guidanceScale } : {}),
        ...(steps !== undefined ? { steps } : {}),
        ...(seed !== undefined ? { seed } : {}),
      },
      output_policy: {},
    },
    storage_estimate: {
      scratch_bytes: capability.estimated_scratch_bytes,
      output_bytes: capability.estimated_output_bytes,
    },
    settlement_effect: {
      effect_type: 'generation.variant.append',
      target_id: lineage.generationId,
      expected_version: lineage.expectedVersion,
      payload: {
        source_variant_id: lineage.sourceVariantId,
        source_object_id: start.object_id,
        variant_type: 'travel_video',
        output_name: 'generated_videos',
        output_ordinal: 0,
        primary_policy: 'preserve',
      },
    },
  });
}

/** Retained for residual callers that still need a typed unsupported error. */
export function travelGenerationUnsupportedError() {
  return unsupportedCapabilityError(TRAVEL_GENERATION_CAPABILITY_ID, TRAVEL_GENERATION_UNSUPPORTED_REASON);
}
