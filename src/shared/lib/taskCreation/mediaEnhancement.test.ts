import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCharacterAnimationTask,
  createImageUpscaleTask,
  createVideoEnhanceTask,
  IMAGE_UPSCALE_CAPABILITY_ID,
  VIDEO_ENHANCE_CAPABILITY_ID,
  CHARACTER_ANIMATION_CAPABILITY_ID,
} from './mediaEnhancement';

const mocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  ingestProjectInput: vi.fn(),
  ingestProjectInputFromUrl: vi.fn(),
  resolveTaskCapability: vi.fn(),
  galleryGet: vi.fn(),
}));

vi.mock('./createTask', () => mocks);
vi.mock('@/integrations/astrid/client', () => ({
  AstridLocalClient: class {
    gallery = { get: mocks.galleryGet };
  },
}));

const digest = (letter: string) => `sha256:${letter.repeat(64)}`;

describe('typed media producer admission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveTaskCapability.mockResolvedValue({
      definition_digest: digest('a'),
      estimated_scratch_bytes: 100,
      estimated_output_bytes: 200,
    });
    mocks.createTask.mockResolvedValue({ task_id: 'task-1', status: 'queued' });
    mocks.galleryGet.mockResolvedValue({
      generation_id: 'generation-1',
      version: 3,
      variants: [{
        id: 'variant-1',
        object_id: digest('b'),
        is_primary: true,
      }],
    });
  });

  it('admits image upscale with one image CAS input and typed output policy', async () => {
    mocks.ingestProjectInputFromUrl.mockResolvedValue({
      object_id: digest('b'), media_type: 'image/png', filename: 'source.png', size: 10, receipt: {},
    });

    await createImageUpscaleTask('project-1', {
      sourceUrl: 'https://example.test/source.png', scaleFactor: 2, noiseScale: 0.1,
    });

    expect(mocks.resolveTaskCapability).toHaveBeenCalledWith('project-1', IMAGE_UPSCALE_CAPABILITY_ID);
    expect(mocks.createTask).toHaveBeenCalledWith(expect.objectContaining({
      project: 'project-1',
      capability_id: IMAGE_UPSCALE_CAPABILITY_ID,
      capability_digest: digest('a'),
      input_object_ids: [digest('b')],
      settlement_effect: {},
    }));
    const request = mocks.createTask.mock.calls[0]?.[0];
    expect(request.spec.params).toMatchObject({
      model: 'seedvr2-upscaler', mode: 'upscale', execution: 'cloud',
      image_ref: { digest: digest('b'), filename: 'source.png', media_type: 'image/png' },
      upscale_factor: 2, noise_scale: 0.1,
    });
    expect(request.spec.output_policy).toEqual({});
  });

  it.each([
    ['interpolation-only', { enableInterpolation: true, enableUpscale: false }],
    ['upscale-only', { enableInterpolation: false, enableUpscale: true }],
    ['combined', { enableInterpolation: true, enableUpscale: true }],
  ])('rejects unproven video enhancement (%s) before capability lookup or ingest', async (_label, settings) => {
    await expect(createVideoEnhanceTask('project-1', {
      sourceUrl: 'https://example.test/source.mp4',
      ...settings,
      numFrames: 2, upscaleFactor: 2, colorFix: true, outputQuality: 'maximum',
    })).rejects.toThrow(`Astrid capability ${VIDEO_ENHANCE_CAPABILITY_ID} is unsupported`);
    expect(mocks.resolveTaskCapability).not.toHaveBeenCalled();
    expect(mocks.ingestProjectInputFromUrl).not.toHaveBeenCalled();
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it('admits the bounded video-upscale profile with one video CAS input', async () => {
    mocks.ingestProjectInputFromUrl.mockResolvedValue({
      object_id: digest('b'), media_type: 'video/mp4', filename: 'source.mp4', size: 10, receipt: {},
    });

    await createVideoEnhanceTask('project-1', {
      sourceUrl: 'https://example.test/source.mp4', enableInterpolation: false,
      enableUpscale: true, numFrames: 1, upscaleFactor: 2, colorFix: false, outputQuality: 'maximum',
    });

    expect(mocks.resolveTaskCapability).toHaveBeenCalledWith('project-1', VIDEO_ENHANCE_CAPABILITY_ID);
    expect(mocks.ingestProjectInputFromUrl).toHaveBeenCalledWith(
      'project-1', 'https://example.test/source.mp4', { maxBytes: 64 * 1024 * 1024 },
    );
    const request = mocks.createTask.mock.calls[0]?.[0];
    expect(request.input_object_ids).toEqual([digest('b')]);
    expect(request.spec.params).toMatchObject({
      video_ref: { digest: digest('b'), media_type: 'video/mp4' },
      enable_interpolation: false, enable_upscale: true,
      interpolation_frames: 1, upscale_factor: 2,
      color_fix: false, output_quality: 'maximum',
    });
  });

  it('binds video enhancement completion to the selected generation variant', async () => {
    mocks.ingestProjectInputFromUrl.mockResolvedValue({
      object_id: digest('b'), media_type: 'video/mp4', filename: 'source.mp4', size: 10, receipt: {},
    });

    await createVideoEnhanceTask('project-1', {
      sourceUrl: 'https://example.test/source.mp4',
      generationId: 'generation-1',
      sourceVariantId: 'variant-1',
      enableInterpolation: false,
      enableUpscale: true,
      numFrames: 1,
      upscaleFactor: 2,
      colorFix: false,
      outputQuality: 'maximum',
    });

    expect(mocks.galleryGet).toHaveBeenCalledWith('generation-1');
    expect(mocks.createTask.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      settlement_effect: {
        effect_type: 'generation.variant.append',
        target_id: 'generation-1',
        expected_version: 3,
        payload: {
          source_variant_id: 'variant-1',
          source_object_id: digest('b'),
          variant_type: 'video_enhance',
          output_name: 'enhanced_video',
          output_ordinal: 0,
          primary_policy: 'preserve',
        },
      },
    }));
  });

  it('rejects a video source whose bytes do not match the selected variant', async () => {
    mocks.ingestProjectInputFromUrl.mockResolvedValue({
      object_id: digest('c'), media_type: 'video/mp4', filename: 'source.mp4', size: 10, receipt: {},
    });

    await expect(createVideoEnhanceTask('project-1', {
      sourceUrl: 'https://example.test/source.mp4',
      generationId: 'generation-1',
      enableInterpolation: false,
      enableUpscale: true,
      numFrames: 1,
      upscaleFactor: 2,
      colorFix: false,
      outputQuality: 'maximum',
    })).rejects.toThrow('does not match the admitted source bytes');
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it.each([
    ['replace-480p', '480p' as const],
    ['replace-720p', '720p' as const],
  ])('rejects replacement character animation (%s) before capability lookup or ingest', async (_label, resolution) => {
    await expect(createCharacterAnimationTask('project-1', {
      characterImageUrl: 'https://example.test/character.jpg',
      motionVideoUrl: 'https://example.test/motion.mp4', prompt: 'walk forward',
      mode: 'replace', resolution, seed: 42, randomSeed: true,
    })).rejects.toThrow(`Astrid capability ${CHARACTER_ANIMATION_CAPABILITY_ID} is unsupported`);
    expect(mocks.resolveTaskCapability).not.toHaveBeenCalled();
    expect(mocks.ingestProjectInputFromUrl).not.toHaveBeenCalled();
    expect(mocks.ingestProjectInput).not.toHaveBeenCalled();
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it('admits bounded animate character animation with ordered image/video CAS inputs', async () => {
    mocks.ingestProjectInputFromUrl
      .mockResolvedValueOnce({
        object_id: digest('b'), media_type: 'image/jpeg', filename: 'character.jpg', size: 10, receipt: {},
      })
      .mockResolvedValueOnce({
        object_id: digest('c'), media_type: 'video/mp4', filename: 'motion.mp4', size: 20, receipt: {},
      });

    await createCharacterAnimationTask('project-1', {
      characterImageUrl: 'https://example.test/character.jpg',
      motionVideoUrl: 'https://example.test/motion.mp4', prompt: 'walk forward',
      mode: 'animate', resolution: '720p', seed: 42, randomSeed: false,
    });

    expect(mocks.resolveTaskCapability).toHaveBeenCalledWith('project-1', CHARACTER_ANIMATION_CAPABILITY_ID);
    expect(mocks.ingestProjectInputFromUrl).toHaveBeenNthCalledWith(
      1, 'project-1', 'https://example.test/character.jpg', expect.objectContaining({ maxBytes: 8 * 1024 * 1024, requireImage: true }),
    );
    expect(mocks.ingestProjectInputFromUrl).toHaveBeenNthCalledWith(
      2, 'project-1', 'https://example.test/motion.mp4', expect.objectContaining({ maxBytes: 64 * 1024 * 1024 }),
    );
    const request = mocks.createTask.mock.calls[0]?.[0];
    expect(request.input_object_ids).toEqual([digest('b'), digest('c')]);
    expect(request.spec.params).toMatchObject({
      reference_image_ref: { digest: digest('b'), media_type: 'image/jpeg' },
      driving_video_ref: { digest: digest('c'), media_type: 'video/mp4' },
      mode: 'animate', resolution: '720p', seed: 42, prompt: 'walk forward',
    });
  });

  it('fails closed before ingest when the video capability is unsupported', async () => {
    await expect(createVideoEnhanceTask('project-1', {
      sourceUrl: 'https://example.test/source.mp4', enableInterpolation: false,
      enableUpscale: false, numFrames: 1, upscaleFactor: 2, colorFix: true, outputQuality: 'high',
    })).rejects.toThrow(`Astrid capability ${VIDEO_ENHANCE_CAPABILITY_ID} is unsupported`);
    expect(mocks.resolveTaskCapability).not.toHaveBeenCalled();
    expect(mocks.ingestProjectInputFromUrl).not.toHaveBeenCalled();
  });

  it('fails closed for wrong media types and zero storage estimates', async () => {
    mocks.resolveTaskCapability.mockResolvedValueOnce({
      definition_digest: digest('a'), estimated_scratch_bytes: 0, estimated_output_bytes: 200,
    });
    await expect(createImageUpscaleTask('project-1', {
      sourceUrl: 'https://example.test/source.png', scaleFactor: 2, noiseScale: 0.1,
    })).rejects.toThrow('no nonzero storage estimate');
    expect(mocks.ingestProjectInputFromUrl).not.toHaveBeenCalled();

    mocks.resolveTaskCapability.mockResolvedValue({
      definition_digest: digest('a'), estimated_scratch_bytes: 100, estimated_output_bytes: 200,
    });
    mocks.ingestProjectInputFromUrl.mockResolvedValue({
      object_id: digest('f'), media_type: 'video/mp4', filename: 'wrong.mp4', size: 10, receipt: {},
    });
    await expect(createImageUpscaleTask('project-1', {
      sourceUrl: 'https://example.test/wrong.mp4', scaleFactor: 2, noiseScale: 0.1,
    })).rejects.toThrow('image media type');
    expect(mocks.createTask).not.toHaveBeenCalled();
  });
});
