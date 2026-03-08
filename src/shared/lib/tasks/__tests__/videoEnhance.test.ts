import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVideoEnhanceTask } from '../videoEnhance';

const mockCreateTask = vi.fn();

vi.mock('../../taskCreation', () => ({
  createTask: (...args: unknown[]) => mockCreateTask(...args),
  validateRequiredFields: (params: Record<string, unknown>, fields: string[]) => {
    for (const field of fields) {
      if (params[field] === undefined || params[field] === null) {
        throw new Error(`${field} is required`);
      }
      if (typeof params[field] === 'string' && (params[field] as string).trim() === '') {
        throw new Error(`${field} cannot be empty`);
      }
    }
  },
  TaskValidationError: class extends Error {
    field?: string;
    constructor(message: string, field?: string) {
      super(message);
      this.name = 'TaskValidationError';
      this.field = field;
    }
  },
}));

describe('createVideoEnhanceTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTask.mockResolvedValue({ task_id: 'task-1', status: 'pending' });
  });

  it('creates an interpolation-only task with defaults', async () => {
    const result = await createVideoEnhanceTask({
      project_id: 'proj-1',
      video_url: 'https://example.com/video.mp4',
      enable_interpolation: true,
      enable_upscale: false,
    });

    expect(result.task).toEqual({ task_id: 'task-1', status: 'pending' });

    const call = mockCreateTask.mock.calls[0][0];
    expect(call.project_id).toBe('proj-1');
    expect(call.task_type).toBe('video_enhance');
    expect(call.params.tool_type).toBe('video-enhance');
    expect(call.params.video_url).toBe('https://example.com/video.mp4');
    expect(call.params.enable_interpolation).toBe(true);
    expect(call.params.enable_upscale).toBe(false);

    // Should have interpolation defaults
    expect(call.params.interpolation).toEqual({
      num_frames: 1,
      use_calculated_fps: true,
      video_quality: 'high',
    });
    // Should NOT have upscale params
    expect(call.params.upscale).toBeUndefined();
  });

  it('creates an upscale-only task with defaults', async () => {
    await createVideoEnhanceTask({
      project_id: 'proj-1',
      video_url: 'https://example.com/video.mp4',
      enable_interpolation: false,
      enable_upscale: true,
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.enable_upscale).toBe(true);
    expect(params.enable_interpolation).toBe(false);
    expect(params.upscale).toEqual({
      upscale_factor: 2,
      color_fix: true,
      output_quality: 'high',
    });
    expect(params.interpolation).toBeUndefined();
  });

  it('creates a combined interpolation + upscale task', async () => {
    await createVideoEnhanceTask({
      project_id: 'proj-1',
      video_url: 'https://example.com/video.mp4',
      enable_interpolation: true,
      enable_upscale: true,
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.interpolation).toBeDefined();
    expect(params.upscale).toBeDefined();
  });

  it('includes custom interpolation params', async () => {
    await createVideoEnhanceTask({
      project_id: 'proj-1',
      video_url: 'https://example.com/video.mp4',
      enable_interpolation: true,
      enable_upscale: false,
      interpolation: {
        num_frames: 3,
        use_calculated_fps: false,
        video_quality: 'maximum',
        use_scene_detection: true,
        loop: true,
      },
    });

    const interp = mockCreateTask.mock.calls[0][0].params.interpolation;
    expect(interp.num_frames).toBe(3);
    expect(interp.use_calculated_fps).toBe(false);
    expect(interp.video_quality).toBe('maximum');
    expect(interp.use_scene_detection).toBe(true);
    expect(interp.loop).toBe(true);
  });

  it('includes custom upscale params', async () => {
    await createVideoEnhanceTask({
      project_id: 'proj-1',
      video_url: 'https://example.com/video.mp4',
      enable_interpolation: false,
      enable_upscale: true,
      upscale: {
        upscale_factor: 4,
        color_fix: false,
        output_quality: 'low',
        quality: 50,
        acceleration: 'full',
      },
    });

    const upscale = mockCreateTask.mock.calls[0][0].params.upscale;
    expect(upscale.upscale_factor).toBe(4);
    expect(upscale.color_fix).toBe(false);
    expect(upscale.output_quality).toBe('low');
    expect(upscale.quality).toBe(50);
    expect(upscale.acceleration).toBe('full');
  });

  it('throws when neither interpolation nor upscale is enabled', async () => {
    await expect(
      createVideoEnhanceTask({
        project_id: 'proj-1',
        video_url: 'https://example.com/video.mp4',
        enable_interpolation: false,
        enable_upscale: false,
      })
    ).rejects.toThrow('At least one enhancement mode');
  });

  it('throws on invalid num_frames', async () => {
    await expect(
      createVideoEnhanceTask({
        project_id: 'proj-1',
        video_url: 'https://example.com/video.mp4',
        enable_interpolation: true,
        enable_upscale: false,
        interpolation: { num_frames: 5 },
      })
    ).rejects.toThrow('num_frames must be between 1 and 4');
  });

  it('throws on invalid upscale_factor', async () => {
    await expect(
      createVideoEnhanceTask({
        project_id: 'proj-1',
        video_url: 'https://example.com/video.mp4',
        enable_interpolation: false,
        enable_upscale: true,
        upscale: { upscale_factor: 5 },
      })
    ).rejects.toThrow('upscale_factor must be between 1 and 4');
  });

  it('includes metadata fields when provided', async () => {
    await createVideoEnhanceTask({
      project_id: 'proj-1',
      video_url: 'https://example.com/video.mp4',
      enable_interpolation: true,
      enable_upscale: false,
      shot_id: 'shot-1',
      based_on: 'gen-1',
      source_variant_id: 'var-1',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.shot_id).toBe('shot-1');
    expect(params.based_on).toBe('gen-1');
    expect(params.is_primary).toBe(true);
    expect(params.source_variant_id).toBe('var-1');
  });

  it('does not include is_primary when based_on is absent', async () => {
    await createVideoEnhanceTask({
      project_id: 'proj-1',
      video_url: 'https://example.com/video.mp4',
      enable_interpolation: true,
      enable_upscale: false,
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.based_on).toBeUndefined();
    expect(params.is_primary).toBeUndefined();
  });

  it('rethrows createTask errors', async () => {
    mockCreateTask.mockRejectedValue(new Error('Server error'));

    await expect(
      createVideoEnhanceTask({
        project_id: 'proj-1',
        video_url: 'https://example.com/video.mp4',
        enable_interpolation: true,
        enable_upscale: false,
      })
    ).rejects.toThrow('Server error');
  });
});
