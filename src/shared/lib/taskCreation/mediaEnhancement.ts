import {
  createTask,
  ingestProjectInputFromUrl,
  resolveTaskCapability,
} from './createTask';
import { TaskValidationError, type RuntimeInput, type TaskCreationResult } from './types';
import { unsupportedCapabilityError } from './legacyBoundary';

export const IMAGE_UPSCALE_CAPABILITY_ID = 'generation.generate_image_upscale';
export const VIDEO_ENHANCE_CAPABILITY_ID = 'vibecomfy.video_enhance';
export const CHARACTER_ANIMATION_CAPABILITY_ID = 'vibecomfy.character_animation';

const IMAGE_UPSCALE_SOURCE_MAX_BYTES = 512_000;
const VIDEO_ENHANCE_UNSUPPORTED_REASON =
  'the pinned ready graph does not implement interpolation, color correction, source-FPS preservation, or typed encoder-quality semantics';
const CHARACTER_ANIMATION_UNSUPPORTED_REASON =
  'the pinned ready graph does not expose a proven mode/resolution contract equivalent to the typed producer request';

export interface ImageUpscaleTaskOptions {
  sourceUrl: string;
  scaleFactor: number;
  noiseScale: number;
}

export interface VideoEnhanceTaskOptions {
  sourceUrl: string;
  enableInterpolation: boolean;
  enableUpscale: boolean;
  numFrames: number;
  upscaleFactor: number;
  colorFix: boolean;
  outputQuality: 'low' | 'medium' | 'high' | 'maximum';
}

export interface CharacterAnimationTaskOptions {
  characterImage?: RuntimeInput;
  characterImageUrl?: string;
  motionVideo?: RuntimeInput;
  motionVideoUrl?: string;
  prompt: string;
  mode: 'replace' | 'animate';
  resolution: '480p' | '720p';
  seed: number;
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

function requireMediaType(receipt: { media_type: string }, expected: string, field: string): void {
  if (!receipt.media_type.startsWith(`${expected}/`)) {
    throw new TaskValidationError(`${field} must be a ${expected} media type`, field);
  }
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

/** Admit one typed video enhancement with a single CAS video source. */
export async function createVideoEnhanceTask(
  _project: string,
  _options: VideoEnhanceTaskOptions,
): Promise<TaskCreationResult> {
  throw unsupportedCapabilityError(VIDEO_ENHANCE_CAPABILITY_ID, VIDEO_ENHANCE_UNSUPPORTED_REASON);
}

/** Admit character animation with ordered image-then-video CAS inputs. */
export async function createCharacterAnimationTask(
  _project: string,
  _options: CharacterAnimationTaskOptions,
): Promise<TaskCreationResult> {
  throw unsupportedCapabilityError(CHARACTER_ANIMATION_CAPABILITY_ID, CHARACTER_ANIMATION_UNSUPPORTED_REASON);
}
