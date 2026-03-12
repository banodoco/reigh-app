import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createImageInpaintTask } from '../imageInpaint';

const mockCreateTask = vi.fn();
const mockProcessBatchResults = vi.fn();
const mockBuildHiresFixParams = vi.fn();

vi.mock('../../../taskCreation', () => ({
  createTask: (...args: unknown[]) => mockCreateTask(...args),
  processBatchResults: (...args: unknown[]) => mockProcessBatchResults(...args),
  buildHiresFixParams: (...args: unknown[]) => mockBuildHiresFixParams(...args),
}));

describe('createImageInpaintTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTask.mockResolvedValue({ task_id: 'task-1', status: 'pending' });
    mockBuildHiresFixParams.mockReturnValue({});
    mockProcessBatchResults.mockImplementation((results: PromiseSettledResult<unknown>[]) => {
      return results
        .filter((r): r is PromiseFulfilledResult<unknown> => r.status === 'fulfilled')
        .map(r => r.value);
    });
  });

  it('creates a single inpaint task when num_generations is 1', async () => {
    const result = await createImageInpaintTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      mask_url: 'https://example.com/mask.png',
      prompt: 'remove the car',
      num_generations: 1,
    });

    expect(result).toBe('task-1');
    expect(mockCreateTask).toHaveBeenCalledOnce();

    const call = mockCreateTask.mock.calls[0][0];
    expect(call.project_id).toBe('proj-1');
    expect(call.task_type).toBe('image_inpaint');
    expect(call.params.image_url).toBe('https://example.com/image.jpg');
    expect(call.params.mask_url).toBe('https://example.com/mask.png');
    expect(call.params.prompt).toBe('remove the car');
    expect(call.params.num_generations).toBe(1);
  });

  it('sets based_on equal to generation_id when provided', async () => {
    await createImageInpaintTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      mask_url: 'https://example.com/mask.png',
      prompt: 'fix this',
      num_generations: 1,
      generation_id: 'gen-100',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.generation_id).toBe('gen-100');
    expect(params.based_on).toBe('gen-100');
  });

  it('includes optional fields when provided', async () => {
    await createImageInpaintTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      mask_url: 'https://example.com/mask.png',
      prompt: 'edit',
      num_generations: 1,
      shot_id: 'shot-1',
      tool_type: 'inpaint',
      loras: [{ path: 'lora-path', scale: 0.8 }],
      create_as_generation: true,
      source_variant_id: 'var-1',
      qwen_edit_model: 'qwen-edit-2511',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.shot_id).toBe('shot-1');
    expect(params.tool_type).toBe('inpaint');
    expect(params.loras).toEqual([{ path: 'lora-path', scale: 0.8 }]);
    expect(params.create_as_generation).toBe(true);
    expect(params.source_variant_id).toBe('var-1');
    expect(params.qwen_edit_model).toBe('qwen-edit-2511');
  });

  it('omits optional fields when not provided', async () => {
    await createImageInpaintTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      mask_url: 'https://example.com/mask.png',
      prompt: 'edit',
      num_generations: 1,
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.shot_id).toBeUndefined();
    expect(params.tool_type).toBeUndefined();
    expect(params.loras).toBeUndefined();
    expect(params.create_as_generation).toBeUndefined();
    expect(params.source_variant_id).toBeUndefined();
    expect(params.qwen_edit_model).toBeUndefined();
  });

  it('creates multiple tasks in parallel when num_generations > 1', async () => {
    mockCreateTask
      .mockResolvedValueOnce({ task_id: 'task-1', status: 'pending' })
      .mockResolvedValueOnce({ task_id: 'task-2', status: 'pending' })
      .mockResolvedValueOnce({ task_id: 'task-3', status: 'pending' });

    const result = await createImageInpaintTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      mask_url: 'https://example.com/mask.png',
      prompt: 'batch edit',
      num_generations: 3,
    });

    expect(mockCreateTask).toHaveBeenCalledTimes(3);
    // processBatchResults is called, returns the first task_id
    expect(mockProcessBatchResults).toHaveBeenCalledOnce();
    expect(result).toBe('task-1');
  });

  it('calls buildHiresFixParams with hires_fix config', async () => {
    const hiresConfig = { hires_scale: 2, hires_steps: 10 };
    mockBuildHiresFixParams.mockReturnValue({ hires_scale: 2, hires_steps: 10 });

    await createImageInpaintTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      mask_url: 'https://example.com/mask.png',
      prompt: 'edit',
      num_generations: 1,
      hires_fix: hiresConfig,
    });

    expect(mockBuildHiresFixParams).toHaveBeenCalledWith(hiresConfig);
    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.hires_scale).toBe(2);
    expect(params.hires_steps).toBe(10);
  });
});
