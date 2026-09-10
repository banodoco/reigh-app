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
}));

vi.mock('./createTask', () => mocks);

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

  it('admits video enhancement with one ordered video CAS input', async () => {
    mocks.ingestProjectInputFromUrl.mockResolvedValue({
      object_id: digest('c'), media_type: 'video/mp4', filename: 'source.mp4', size: 10, receipt: {},
    });

    await createVideoEnhanceTask('project-1', {
      sourceUrl: 'https://example.test/source.mp4', enableInterpolation: true,
      enableUpscale: true, numFrames: 2, upscaleFactor: 2, colorFix: true, outputQuality: 'maximum',
    });

    expect(mocks.resolveTaskCapability).toHaveBeenCalledWith('project-1', VIDEO_ENHANCE_CAPABILITY_ID);
    const request = mocks.createTask.mock.calls[0]?.[0];
    expect(request.input_object_ids).toEqual([digest('c')]);
    expect(request.spec.params.video_ref.digest).toBe(digest('c'));
    expect(request.spec.params).toMatchObject({
      enable_interpolation: true, enable_upscale: true, interpolation_frames: 2,
      upscale_factor: 2, color_fix: true, output_quality: 'maximum',
    });
    expect(request.storage_estimate).toEqual({ scratch_bytes: 100, output_bytes: 200 });
  });

  it('admits character animation with image before driving-video CAS input', async () => {
    mocks.ingestProjectInputFromUrl
      .mockResolvedValueOnce({
        object_id: digest('d'), media_type: 'image/jpeg', filename: 'character.jpg', size: 10, receipt: {},
      })
      .mockResolvedValueOnce({
        object_id: digest('e'), media_type: 'video/mp4', filename: 'motion.mp4', size: 10, receipt: {},
      });

    await createCharacterAnimationTask('project-1', {
      characterImageUrl: 'https://example.test/character.jpg',
      motionVideoUrl: 'https://example.test/motion.mp4', prompt: 'walk forward',
      mode: 'animate', resolution: '480p', seed: 42, randomSeed: true,
    });

    expect(mocks.resolveTaskCapability).toHaveBeenCalledWith('project-1', CHARACTER_ANIMATION_CAPABILITY_ID);
    const request = mocks.createTask.mock.calls[0]?.[0];
    expect(request.input_object_ids).toEqual([digest('d'), digest('e')]);
    expect(request.spec.params).toMatchObject({
      mode: 'animate', resolution: '480p', seed: 42,
      reference_image_ref: { digest: digest('d') }, driving_video_ref: { digest: digest('e') },
    });
    expect(request.spec.params.random_seed).toBeUndefined();
  });

  it('ingests producer-owned character and motion bytes directly when available', async () => {
    mocks.ingestProjectInput
      .mockResolvedValueOnce({
        object_id: digest('g'), media_type: 'image/png', filename: 'character.png', size: 10, receipt: {},
      })
      .mockResolvedValueOnce({
        object_id: digest('h'), media_type: 'video/mp4', filename: 'motion.mp4', size: 10, receipt: {},
      });

    await createCharacterAnimationTask('project-1', {
      characterImage: new Uint8Array([1, 2, 3]),
      motionVideo: new Uint8Array([4, 5, 6]),
      prompt: 'walk forward', mode: 'animate', resolution: '480p', seed: 42, randomSeed: false,
    });

    expect(mocks.ingestProjectInput).toHaveBeenNthCalledWith(
      1, 'project-1', expect.any(Uint8Array), { maxBytes: 8 * 1024 * 1024 },
    );
    expect(mocks.ingestProjectInput).toHaveBeenNthCalledWith(
      2, 'project-1', expect.any(Uint8Array), { maxBytes: 64 * 1024 * 1024 },
    );
    expect(mocks.ingestProjectInputFromUrl).not.toHaveBeenCalled();
  });

  it('fails closed before ingest when video settings have no operation', async () => {
    await expect(createVideoEnhanceTask('project-1', {
      sourceUrl: 'https://example.test/source.mp4', enableInterpolation: false,
      enableUpscale: false, numFrames: 1, upscaleFactor: 2, colorFix: true, outputQuality: 'high',
    })).rejects.toThrow('Enable interpolation or upscale');
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
