import {
  createTask,
  ingestProjectInput,
  ingestProjectInputFromUrl,
  resolveTaskCapability,
} from './createTask';
import { AstridLocalClient } from '@/integrations/astrid/client';
import { runtimeSha256IdSchema } from '@/tools/video-editor/data/bridgeContract';
import { TaskValidationError, type RuntimeInput, type TaskCreationResult } from './types';
import { unsupportedCapabilityError } from './legacyBoundary';

export const IMAGE_UPSCALE_CAPABILITY_ID = 'generation.generate_image_upscale';
export const VIDEO_ENHANCE_CAPABILITY_ID = 'vibecomfy.video_enhance';
export const CHARACTER_ANIMATION_CAPABILITY_ID = 'vibecomfy.character_animation';

const IMAGE_UPSCALE_SOURCE_MAX_BYTES = 512_000;
const VIDEO_ENHANCE_SOURCE_MAX_BYTES = 64 * 1024 * 1024;
const CHARACTER_IMAGE_SOURCE_MAX_BYTES = 8 * 1024 * 1024;
const CHARACTER_VIDEO_SOURCE_MAX_BYTES = 64 * 1024 * 1024;
const MAX_SEED = 2_147_483_647;

export interface ImageUpscaleTaskOptions {
  sourceUrl: string;
  scaleFactor: number;
  noiseScale: number;
}

export interface VideoEnhanceTaskOptions {
  sourceUrl: string;
  generationId?: string;
  sourceVariantId?: string | null;
  enableInterpolation: boolean;
  enableUpscale: boolean;
  numFrames: number;
  upscaleFactor: number;
  colorFix: boolean;
  outputQuality: 'low' | 'medium' | 'high' | 'maximum';
}

async function resolveVideoEnhanceLineage(
  project: string,
  generationId: string,
  requestedVariantId?: string | null,
): Promise<{ generationId: string; expectedVersion: number; sourceVariantId: string; sourceObjectId: string }> {
  const detail = await new AstridLocalClient({ projectSlug: project }).gallery.get(generationId);
  const expectedVersion = detail.version;
  if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new TaskValidationError(
      'Astrid video generation has no usable version for atomic enhancement settlement',
      'lineage',
    );
  }
  const sourceVariant = requestedVariantId
    ? detail.variants.find((variant) => variant.id === requestedVariantId)
    : detail.variants.find((variant) => variant.is_primary) ?? detail.variants[0];
  if (!sourceVariant) {
    throw new TaskValidationError(
      'Astrid video generation has no source variant for atomic enhancement settlement',
      'lineage',
    );
  }
  const parsedSourceObjectId = runtimeSha256IdSchema.safeParse(sourceVariant.object_id);
  if (!parsedSourceObjectId.success) {
    throw new TaskValidationError(
      'Astrid video source variant has no CAS object identity for atomic enhancement settlement',
      'lineage',
    );
  }
  return {
    generationId,
    expectedVersion,
    sourceVariantId: sourceVariant.id,
    sourceObjectId: parsedSourceObjectId.data,
  };
}

export interface CharacterAnimationTaskOptions {
  characterImage?: RuntimeInput;
  characterImageUrl?: string;
  motionVideo?: RuntimeInput;
  motionVideoUrl?: string;
  prompt: string;
  mode: 'replace' | 'animate';
  resolution: '480p' | '720p';
  /** Resolved by the Character Animate producer before Runtime admission. */
  seed: number;
  /** Compatibility/provenance flag; does not replace the admitted seed. */
  randomSeed: boolean;
}

function requireEstimate(
  capability: { estimated_scratch_bytes: number; estimated_output_bytes: number },
  capabilityId: string,
): void {
  if (capability.estimated_scratch_bytes <= 0 || capability.estimated_output_bytes <= 0) {
    throw new TaskValidationError(
      `Astrid capability ${capabilityId} has no nonzero storage estimate; producer admission is blocked`,
      'storage_estimate',
    );
  }
}

function requireNumber(value: number, field: string, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new TaskValidationError(`${field} must be between ${min} and ${max}`, field);
  }
  return value;
}

function requireInteger(value: number, field: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new TaskValidationError(`${field} must be an integer from ${min} through ${max}`, field);
  }
  return value;
}

function requirePrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) throw new TaskValidationError('Character animation prompt must be non-empty', 'prompt');
  return trimmed;
}

function requireMediaType(receipt: { media_type: string }, expected: string, field: string): void {
  if (!receipt.media_type.startsWith(`${expected}/`)) {
    throw new TaskValidationError(`${field} must be a ${expected} media type`, field);
  }
}

async function ingestMediaSource(
  project: string,
  input: RuntimeInput | undefined,
  sourceUrl: string | undefined,
  options: { maxBytes: number; field: string; requireImage?: boolean },
): Promise<Awaited<ReturnType<typeof ingestProjectInput>>> {
  if (input !== undefined) {
    return ingestProjectInput(project, input, { maxBytes: options.maxBytes, field: options.field });
  }
  if (!sourceUrl) {
    throw new TaskValidationError(`${options.field} is required`, options.field);
  }
  return ingestProjectInputFromUrl(project, sourceUrl, {
    maxBytes: options.maxBytes,
    requireImage: options.requireImage,
  });
}

/** Admit one image upscale from a project-authorized CAS source. */
export async function createImageUpscaleTask(
  project: string,
  options: ImageUpscaleTaskOptions,
): Promise<TaskCreationResult> {
  const scaleFactor = requireNumber(options.scaleFactor, 'scaleFactor', 1, 10);
  const noiseScale = requireNumber(options.noiseScale, 'noiseScale', 0, 1);
  const capability = await resolveTaskCapability(project, IMAGE_UPSCALE_CAPABILITY_ID);
  requireEstimate(capability, IMAGE_UPSCALE_CAPABILITY_ID);
  const source = await ingestProjectInputFromUrl(project, options.sourceUrl, {
    maxBytes: IMAGE_UPSCALE_SOURCE_MAX_BYTES,
  });
  requireMediaType(source, 'image', 'sourceUrl');

  return createTask({
    project,
    capability_id: IMAGE_UPSCALE_CAPABILITY_ID,
    capability_digest: capability.definition_digest,
    schema_version: '1',
    input_object_ids: [source.object_id],
    spec: {
      family: IMAGE_UPSCALE_CAPABILITY_ID,
      params: {
        model: 'seedvr2-upscaler',
        mode: 'upscale',
        execution: 'cloud',
        count: 1,
        image_ref: {
          digest: source.object_id,
          filename: source.filename,
          media_type: source.media_type,
        },
        upscale_mode: 'factor',
        upscale_factor: scaleFactor,
        noise_scale: noiseScale,
      },
      // The capability manifest owns the fixed result/manifest ports.  No
      // producer-side policy field is invented without matching host enforcement.
      output_policy: {},
    },
    storage_estimate: {
      scratch_bytes: capability.estimated_scratch_bytes,
      output_bytes: capability.estimated_output_bytes,
    },
    settlement_effect: {},
  });
}

/** Admit the bounded source-FPS/audio-preserving video-upscale profile. */
export async function createVideoEnhanceTask(
  project: string,
  options: VideoEnhanceTaskOptions,
): Promise<TaskCreationResult> {
  if (options.enableInterpolation) {
    throw unsupportedCapabilityError(
      VIDEO_ENHANCE_CAPABILITY_ID,
      'the admitted ready graph is upscale-only; interpolation is not wired',
    );
  }
  if (!options.enableUpscale) {
    throw unsupportedCapabilityError(
      VIDEO_ENHANCE_CAPABILITY_ID,
      'the admitted ready graph requires enableUpscale=true',
    );
  }
  if (options.numFrames !== 1) {
    throw unsupportedCapabilityError(
      VIDEO_ENHANCE_CAPABILITY_ID,
      'the admitted ready graph preserves source FPS and requires numFrames=1',
    );
  }
  if (options.colorFix) {
    throw unsupportedCapabilityError(
      VIDEO_ENHANCE_CAPABILITY_ID,
      'the admitted ready graph has no color-correction node',
    );
  }
  if (options.outputQuality !== 'maximum') {
    throw unsupportedCapabilityError(
      VIDEO_ENHANCE_CAPABILITY_ID,
      'the admitted ready graph exposes only its fixed maximum-quality encoder profile',
    );
  }
  const upscaleFactor = requireNumber(options.upscaleFactor, 'upscaleFactor', 1, 4);
  if (options.sourceVariantId && !options.generationId) {
    throw new TaskValidationError(
      'sourceVariantId requires generationId lineage',
      'lineage',
    );
  }
  const lineage = options.generationId
    ? await resolveVideoEnhanceLineage(project, options.generationId, options.sourceVariantId)
    : null;
  const capability = await resolveTaskCapability(project, VIDEO_ENHANCE_CAPABILITY_ID);
  requireEstimate(capability, VIDEO_ENHANCE_CAPABILITY_ID);
  const source = await ingestProjectInputFromUrl(project, options.sourceUrl, {
    maxBytes: VIDEO_ENHANCE_SOURCE_MAX_BYTES,
  });
  requireMediaType(source, 'video', 'sourceUrl');
  if (lineage && source.object_id !== lineage.sourceObjectId) {
    throw new TaskValidationError(
      'Selected Astrid video source variant does not match the admitted source bytes',
      'lineage',
    );
  }

  return createTask({
    project,
    capability_id: VIDEO_ENHANCE_CAPABILITY_ID,
    capability_digest: capability.definition_digest,
    schema_version: '1',
    input_object_ids: [source.object_id],
    spec: {
      family: VIDEO_ENHANCE_CAPABILITY_ID,
      params: {
        video_ref: {
          digest: source.object_id,
          filename: source.filename,
          media_type: source.media_type,
        },
        enable_interpolation: false,
        enable_upscale: true,
        interpolation_frames: 1,
        upscale_factor: upscaleFactor,
        color_fix: false,
        output_quality: 'maximum',
      },
      output_policy: {},
    },
    storage_estimate: {
      scratch_bytes: capability.estimated_scratch_bytes,
      output_bytes: capability.estimated_output_bytes,
    },
    settlement_effect: lineage
      ? {
          effect_type: 'generation.variant.append',
          target_id: lineage.generationId,
          expected_version: lineage.expectedVersion,
          payload: {
            source_variant_id: lineage.sourceVariantId,
            source_object_id: source.object_id,
            variant_type: 'video_enhance',
            output_name: 'enhanced_video',
            output_ordinal: 0,
            primary_policy: 'preserve',
          },
        }
      : {},
  });
}

/** Admit bounded animate-mode character animation with ordered CAS inputs. */
export async function createCharacterAnimationTask(
  project: string,
  options: CharacterAnimationTaskOptions,
): Promise<TaskCreationResult> {
  if (options.mode !== 'animate') {
    throw unsupportedCapabilityError(
      CHARACTER_ANIMATION_CAPABILITY_ID,
      'the admitted ready graph represents animate mode only; replacement is not wired',
    );
  }
  if (options.resolution !== '480p' && options.resolution !== '720p') {
    throw new TaskValidationError('resolution must be 480p or 720p', 'resolution');
  }
  const seed = requireInteger(options.seed, 'seed', 0, MAX_SEED);
  const prompt = requirePrompt(options.prompt);
  const capability = await resolveTaskCapability(project, CHARACTER_ANIMATION_CAPABILITY_ID);
  requireEstimate(capability, CHARACTER_ANIMATION_CAPABILITY_ID);
  const character = await ingestMediaSource(
    project,
    options.characterImage,
    options.characterImageUrl,
    { maxBytes: CHARACTER_IMAGE_SOURCE_MAX_BYTES, field: 'characterImageUrl', requireImage: true },
  );
  requireMediaType(character, 'image', 'characterImageUrl');
  const motion = await ingestMediaSource(
    project,
    options.motionVideo,
    options.motionVideoUrl,
    { maxBytes: CHARACTER_VIDEO_SOURCE_MAX_BYTES, field: 'motionVideoUrl' },
  );
  requireMediaType(motion, 'video', 'motionVideoUrl');

  return createTask({
    project,
    capability_id: CHARACTER_ANIMATION_CAPABILITY_ID,
    capability_digest: capability.definition_digest,
    schema_version: '1',
    input_object_ids: [character.object_id, motion.object_id],
    spec: {
      family: CHARACTER_ANIMATION_CAPABILITY_ID,
      params: {
        reference_image_ref: {
          digest: character.object_id,
          filename: character.filename,
          media_type: character.media_type,
        },
        driving_video_ref: {
          digest: motion.object_id,
          filename: motion.filename,
          media_type: motion.media_type,
        },
        mode: 'animate',
        resolution: options.resolution,
        seed,
        prompt,
      },
      output_policy: {},
    },
    storage_estimate: {
      scratch_bytes: capability.estimated_scratch_bytes,
      output_bytes: capability.estimated_output_bytes,
    },
    settlement_effect: {
      effect_type: 'generation.create_with_variant',
      target_id: project,
      payload: {
        generation_type: 'video',
        metadata: {
          params: {
            tool_type: 'character-animate',
            content_type: 'video',
            prompt,
            mode: 'animate',
            resolution: options.resolution,
            seed,
          },
        },
        variant_type: 'character_animation',
        output_name: 'animated_video',
        output_ordinal: 0,
        primary_policy: 'preserve',
      },
    },
  });
}
