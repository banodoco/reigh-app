import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateCharacterAnimationTask = vi.fn();
const mockValidateRequiredFields = vi.fn();

vi.mock('@/shared/lib/taskCreation', () => ({
  createCharacterAnimationTask: (...args: unknown[]) => mockCreateCharacterAnimationTask(...args),
  validateRequiredFields: (...args: unknown[]) => mockValidateRequiredFields(...args),
  TaskValidationError: class TaskValidationError extends Error {
    field: string;
    constructor(message: string, field: string) {
      super(message);
      this.name = 'TaskValidationError';
      this.field = field;
    }
  },
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

import { createCharacterAnimateTask, type CharacterAnimateTaskParams } from '../characterAnimate';

describe('createCharacterAnimateTask', () => {
  const validParams: CharacterAnimateTaskParams = {
    project_id: 'proj-123',
    character_image_url: 'https://example.com/character.png',
    motion_video_url: 'https://example.com/motion.mp4',
    prompt: 'dancing character',
    mode: 'animate',
    resolution: '480p',
    seed: 42,
    random_seed: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCharacterAnimationTask.mockResolvedValue({ task_id: 'created-task-id' });
  });

  it('creates a typed task with both media URLs handed to CAS admission', async () => {
    const result = await createCharacterAnimateTask(validParams);
    expect(result).toEqual({ task_id: 'created-task-id' });
    expect(mockCreateCharacterAnimationTask).toHaveBeenCalledWith('proj-123', {
      characterImageUrl: 'https://example.com/character.png',
      motionVideoUrl: 'https://example.com/motion.mp4',
      prompt: 'dancing character', mode: 'animate', resolution: '480p', seed: 42, randomSeed: false,
    });
  });

  it('uses the default prompt when prompt is not provided', async () => {
    await createCharacterAnimateTask({ ...validParams, prompt: undefined });
    expect(mockCreateCharacterAnimationTask).toHaveBeenCalledWith(
      'proj-123', expect.objectContaining({ prompt: 'natural expression; preserve outfit details' }),
    );
  });

  it('resolves random seed once before typed admission', async () => {
    await createCharacterAnimateTask({ ...validParams, random_seed: true, seed: 42 });
    const options = mockCreateCharacterAnimationTask.mock.calls[0]?.[1];
    expect(options.seed).toBeGreaterThanOrEqual(0);
    expect(options.seed).toBeLessThanOrEqual(2_147_483_647);
  });

  it('preserves an explicit seed when random_seed is false', async () => {
    await createCharacterAnimateTask({ ...validParams, random_seed: false, seed: 12345 });
    expect(mockCreateCharacterAnimationTask.mock.calls[0]?.[1].seed).toBe(12345);
  });

  it('validates required fields before admission', async () => {
    await createCharacterAnimateTask(validParams);
    expect(mockValidateRequiredFields).toHaveBeenCalledWith(validParams, [
      'project_id', 'character_image_url', 'motion_video_url', 'mode', 'resolution',
    ]);
  });

  it.each([
    ['invalid mode', { mode: 'invalid' as 'animate' | 'replace' }, "mode must be 'replace' or 'animate'"],
    ['invalid resolution', { resolution: '1080p' as '480p' | '720p' }, "resolution must be '480p' or '720p'"],
    ['empty character image', { character_image_url: '' }, 'character_image_url is required'],
    ['empty motion video', { motion_video_url: '' }, 'motion_video_url is required'],
  ] as const)('rejects %s', async (_label, override, message) => {
    await expect(createCharacterAnimateTask({ ...validParams, ...override })).rejects.toThrow(message);
    expect(mockCreateCharacterAnimationTask).not.toHaveBeenCalled();
  });

  it('propagates typed admission errors', async () => {
    mockCreateCharacterAnimationTask.mockRejectedValue(new Error('Network error'));
    await expect(createCharacterAnimateTask(validParams)).rejects.toThrow('Network error');
  });

  it('preserves replace and 720p controls in the typed request', async () => {
    await createCharacterAnimateTask({ ...validParams, mode: 'replace', resolution: '720p' });
    expect(mockCreateCharacterAnimationTask.mock.calls[0]?.[1]).toMatchObject({
      mode: 'replace', resolution: '720p',
    });
  });
});
