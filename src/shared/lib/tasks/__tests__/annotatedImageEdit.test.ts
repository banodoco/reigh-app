import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAnnotatedImageEditTask } from '../annotatedImageEdit';

const mockCreateTask = vi.fn();
const mockBuildHiresFixParams = vi.fn();
const mockProcessBatchResults = vi.fn();

vi.mock('../../taskCreation', () => ({
  createTask: (...args: unknown[]) => mockCreateTask(...args),
  buildHiresFixParams: (...args: unknown[]) => mockBuildHiresFixParams(...args),
  processBatchResults: (...args: unknown[]) => mockProcessBatchResults(...args),
  TaskValidationError: class TaskValidationError extends Error {
    field?: string;
    constructor(message: string, field?: string) {
      super(message);
      this.name = 'TaskValidationError';
      this.field = field;
    }
  },
}));

describe('createAnnotatedImageEditTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTask.mockResolvedValue({ task_id: 'task-1', status: 'pending' });
    mockBuildHiresFixParams.mockReturnValue({});
    mockProcessBatchResults.mockImplementation((results: PromiseSettledResult<unknown>[]) => {
      const fulfilled = results.filter(
        (result): result is PromiseFulfilledResult<unknown> => result.status === 'fulfilled',
      );
      if (fulfilled.length === 0) {
        throw new Error('All batch tasks failed');
      }
      return fulfilled.map((result) => result.value);
    });
  });

  it('creates a single task for num_generations = 1', async () => {
    const result = await createAnnotatedImageEditTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      mask_url: 'https://example.com/mask.png',
      prompt: 'annotate this',
      num_generations: 1,
    });

    expect(result).toBe('task-1');
    expect(mockCreateTask).toHaveBeenCalledOnce();

    const call = mockCreateTask.mock.calls[0][0];
    expect(call.project_id).toBe('proj-1');
    expect(call.task_type).toBe('annotated_image_edit');
    expect(call.params.image_url).toBe('https://example.com/image.jpg');
    expect(call.params.mask_url).toBe('https://example.com/mask.png');
    expect(call.params.prompt).toBe('annotate this');
    expect(call.params.num_generations).toBe(1);
  });

  it('sets based_on equal to generation_id', async () => {
    await createAnnotatedImageEditTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      mask_url: 'https://example.com/mask.png',
      prompt: 'edit',
      num_generations: 1,
      generation_id: 'gen-5',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.generation_id).toBe('gen-5');
    expect(params.based_on).toBe('gen-5');
  });

  it('includes all optional fields when provided', async () => {
    await createAnnotatedImageEditTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      mask_url: 'https://example.com/mask.png',
      prompt: 'edit',
      num_generations: 1,
      shot_id: 'shot-1',
      tool_type: 'annotated-edit',
      loras: [{ path: 'lora', scale: 1.0 }],
      create_as_generation: true,
      source_variant_id: 'v-1',
      qwen_edit_model: 'qwen-edit-2509',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.shot_id).toBe('shot-1');
    expect(params.tool_type).toBe('annotated-edit');
    expect(params.loras).toEqual([{ path: 'lora', scale: 1.0 }]);
    expect(params.create_as_generation).toBe(true);
    expect(params.source_variant_id).toBe('v-1');
    expect(params.qwen_edit_model).toBe('qwen-edit-2509');
  });

  it('creates multiple tasks in parallel when num_generations > 1', async () => {
    mockCreateTask
      .mockResolvedValueOnce({ task_id: 'task-1', status: 'pending' })
      .mockResolvedValueOnce({ task_id: 'task-2', status: 'pending' });

    const result = await createAnnotatedImageEditTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      mask_url: 'https://example.com/mask.png',
      prompt: 'batch',
      num_generations: 2,
    });

    expect(mockCreateTask).toHaveBeenCalledTimes(2);
    expect(mockProcessBatchResults).toHaveBeenCalledOnce();
    expect(result).toBe('task-1');
  });

  it('throws when all batch tasks fail', async () => {
    mockCreateTask.mockRejectedValue(new Error('all failed'));

    await expect(
      createAnnotatedImageEditTask({
        project_id: 'proj-1',
        image_url: 'https://example.com/image.jpg',
        mask_url: 'https://example.com/mask.png',
        prompt: 'batch',
        num_generations: 2,
      })
    ).rejects.toThrow('All batch tasks failed');
  });

  it('returns first successful task when some batch tasks fail', async () => {
    mockCreateTask
      .mockRejectedValueOnce(new Error('first failed'))
      .mockResolvedValueOnce({ task_id: 'task-2', status: 'pending' });

    const result = await createAnnotatedImageEditTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      mask_url: 'https://example.com/mask.png',
      prompt: 'partial fail',
      num_generations: 2,
    });

    expect(mockProcessBatchResults).toHaveBeenCalledOnce();
    expect(result).toBe('task-2');
  });

  it('spreads hires fix params into task params', async () => {
    const hiresConfig = { hires_scale: 1.5, hires_denoise: 0.3 };
    mockBuildHiresFixParams.mockReturnValue({ hires_scale: 1.5, hires_denoise: 0.3 });

    await createAnnotatedImageEditTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      mask_url: 'https://example.com/mask.png',
      prompt: 'edit',
      num_generations: 1,
      hires_fix: hiresConfig,
    });

    expect(mockBuildHiresFixParams).toHaveBeenCalledWith(hiresConfig);
    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.hires_scale).toBe(1.5);
    expect(params.hires_denoise).toBe(0.3);
  });

  it('does not include empty loras array', async () => {
    await createAnnotatedImageEditTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      mask_url: 'https://example.com/mask.png',
      prompt: 'edit',
      num_generations: 1,
      loras: [],
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.loras).toBeUndefined();
  });
});
