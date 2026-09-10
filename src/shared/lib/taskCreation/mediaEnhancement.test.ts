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

  it.each([
    ['replace-480p', 'replace' as const, '480p' as const],
    ['replace-720p', 'replace' as const, '720p' as const],
    ['animate-480p', 'animate' as const, '480p' as const],
    ['animate-720p', 'animate' as const, '720p' as const],
  ])('rejects unproven character animation (%s) before capability lookup or ingest', async (_label, mode, resolution) => {
    await expect(createCharacterAnimationTask('project-1', {
      characterImageUrl: 'https://example.test/character.jpg',
      motionVideoUrl: 'https://example.test/motion.mp4', prompt: 'walk forward',
      mode, resolution, seed: 42, randomSeed: true,
    })).rejects.toThrow(`Astrid capability ${CHARACTER_ANIMATION_CAPABILITY_ID} is unsupported`);
    expect(mocks.resolveTaskCapability).not.toHaveBeenCalled();
    expect(mocks.ingestProjectInputFromUrl).not.toHaveBeenCalled();
    expect(mocks.ingestProjectInput).not.toHaveBeenCalled();
    expect(mocks.createTask).not.toHaveBeenCalled();
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
