import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBatchMagicEditTasks } from '../magicEdit';

const mockCreateTask = vi.fn();
const mockResolveProjectResolution = vi.fn();
const mockProcessBatchResults = vi.fn();
const mockBuildHiresFixParams = vi.fn();

vi.mock('../../taskCreation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../taskCreation')>();
  return {
    ...actual,
    createTask: (...args: unknown[]) => mockCreateTask(...args),
    resolveProjectResolution: (...args: unknown[]) => mockResolveProjectResolution(...args),
    validateRequiredFields: (params: Record<string, unknown>, fields: string[]) => {
      for (const field of fields) {
        if (params[field] === undefined || params[field] === null) {
          throw new TVE(`${field} is required`, field);
        }
        if (typeof params[field] === 'string' && (params[field] as string).trim() === '') {
          throw new TVE(`${field} cannot be empty`, field);
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
    processBatchResults: (...args: unknown[]) => mockProcessBatchResults(...args),
    buildHiresFixParams: (...args: unknown[]) => mockBuildHiresFixParams(...args),
  };
});

class TVE extends Error {
  field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = 'TaskValidationError';
    this.field = field;
  }
}

describe('createBatchMagicEditTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTask.mockResolvedValue({ task_id: 'task-1', status: 'pending' });
    mockResolveProjectResolution.mockResolvedValue({ resolution: '1024x768', aspectRatio: '4:3' });
    mockBuildHiresFixParams.mockReturnValue({});
    mockProcessBatchResults.mockImplementation((results: PromiseSettledResult<unknown>[]) => {
      return results
        .filter((r): r is PromiseFulfilledResult<unknown> => r.status === 'fulfilled')
        .map(r => r.value);
    });
  });

  it('creates a single task with default params', async () => {
    await createBatchMagicEditTasks({
      project_id: 'proj-1',
      prompt: 'make the sky red',
      image_url: 'https://example.com/image.jpg',
      numImages: 1,
    });

    expect(mockCreateTask).toHaveBeenCalledOnce();

    const call = mockCreateTask.mock.calls[0][0];
    expect(call.project_id).toBe('proj-1');
    expect(call.task_type).toBe('qwen_image_edit');
    expect(call.params.prompt).toBe('make the sky red');
    expect(call.params.image).toBe('https://example.com/image.jpg');
    expect(call.params.output_format).toBe('jpeg');
    expect(call.params.qwen_edit_model).toBe('qwen-edit');
    expect(call.params.enable_sync_mode).toBe(false);
    expect(call.params.max_wait_seconds).toBe(300);
    expect(call.params.enable_base64_output).toBe(false);
    expect(call.params.add_in_position).toBe(false);
  });

  it('resolves project resolution before creating tasks', async () => {
    await createBatchMagicEditTasks({
      project_id: 'proj-1',
      prompt: 'edit',
      image_url: 'https://example.com/image.jpg',
      numImages: 1,
    });

    expect(mockResolveProjectResolution).toHaveBeenCalledWith('proj-1', undefined);
  });

  it('passes custom resolution directly', async () => {
    await createBatchMagicEditTasks({
      project_id: 'proj-1',
      prompt: 'edit',
      image_url: 'https://example.com/image.jpg',
      numImages: 1,
      resolution: '512x512',
    });

    // Resolution is resolved, then passed to buildMagicEditTaskParams
    expect(mockResolveProjectResolution).toHaveBeenCalledWith('proj-1', '512x512');
  });

  it('includes negative_prompt when provided', async () => {
    await createBatchMagicEditTasks({
      project_id: 'proj-1',
      prompt: 'edit',
      image_url: 'https://example.com/image.jpg',
      numImages: 1,
      negative_prompt: 'no blur',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.negative_prompt).toBe('no blur');
  });

  it('includes in_scene when provided', async () => {
    await createBatchMagicEditTasks({
      project_id: 'proj-1',
      prompt: 'edit',
      image_url: 'https://example.com/image.jpg',
      numImages: 1,
      in_scene: true,
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.in_scene).toBe(true);
  });

  it('includes lineage tracking fields', async () => {
    await createBatchMagicEditTasks({
      project_id: 'proj-1',
      prompt: 'edit',
      image_url: 'https://example.com/image.jpg',
      numImages: 1,
      based_on: 'gen-1',
      source_variant_id: 'var-1',
      create_as_generation: true,
      tool_type: 'magic-edit',
      shot_id: 'shot-1',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.based_on).toBe('gen-1');
    expect(params.source_variant_id).toBe('var-1');
    expect(params.create_as_generation).toBe(true);
    expect(params.tool_type).toBe('magic-edit');
    expect(params.shot_id).toBe('shot-1');
  });

  it('includes loras when provided', async () => {
    const loras = [{ path: '/lora1', scale: 0.7, strength: 1 }];

    await createBatchMagicEditTasks({
      project_id: 'proj-1',
      prompt: 'edit',
      image_url: 'https://example.com/image.jpg',
      numImages: 1,
      loras,
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.loras).toEqual(loras);
  });

  it('does not include loras when empty array', async () => {
    await createBatchMagicEditTasks({
      project_id: 'proj-1',
      prompt: 'edit',
      image_url: 'https://example.com/image.jpg',
      numImages: 1,
      loras: [],
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.loras).toBeUndefined();
  });

  it('creates multiple tasks for numImages > 1', async () => {
    mockCreateTask
      .mockResolvedValueOnce({ task_id: 'task-1', status: 'pending' })
      .mockResolvedValueOnce({ task_id: 'task-2', status: 'pending' });

    await createBatchMagicEditTasks({
      project_id: 'proj-1',
      prompt: 'batch edit',
      image_url: 'https://example.com/image.jpg',
      numImages: 2,
    });

    expect(mockCreateTask).toHaveBeenCalledTimes(2);
    expect(mockProcessBatchResults).toHaveBeenCalledOnce();
  });

  it('increments seed per task in batch', async () => {
    await createBatchMagicEditTasks({
      project_id: 'proj-1',
      prompt: 'batch',
      image_url: 'https://example.com/image.jpg',
      numImages: 3,
      seed: 100,
    });

    const seeds = mockCreateTask.mock.calls.map(([call]) => call.params.seed);
    expect(seeds).toEqual([100, 101, 102]);
  });

  it('passes qwen_edit_model through', async () => {
    await createBatchMagicEditTasks({
      project_id: 'proj-1',
      prompt: 'edit',
      image_url: 'https://example.com/image.jpg',
      numImages: 1,
      qwen_edit_model: 'qwen-edit-2511',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.qwen_edit_model).toBe('qwen-edit-2511');
  });

  it('does not include resolution when "custom"', async () => {
    mockResolveProjectResolution.mockResolvedValue({ resolution: 'custom', aspectRatio: 'custom' });

    await createBatchMagicEditTasks({
      project_id: 'proj-1',
      prompt: 'edit',
      image_url: 'https://example.com/image.jpg',
      numImages: 1,
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.resolution).toBeUndefined();
  });

  it('throws on empty prompt', async () => {
    await expect(
      createBatchMagicEditTasks({
        project_id: 'proj-1',
        prompt: '   ',
        image_url: 'https://example.com/image.jpg',
        numImages: 1,
      })
    ).rejects.toThrow();
  });

  it('throws on invalid image URL', async () => {
    await expect(
      createBatchMagicEditTasks({
        project_id: 'proj-1',
        prompt: 'edit',
        image_url: 'not-a-url',
        numImages: 1,
      })
    ).rejects.toThrow('Image URL must be a valid URL');
  });

  it('throws on invalid seed', async () => {
    await expect(
      createBatchMagicEditTasks({
        project_id: 'proj-1',
        prompt: 'edit',
        image_url: 'https://example.com/image.jpg',
        numImages: 1,
        seed: -1,
      })
    ).rejects.toThrow('Seed must be a 32-bit positive integer');
  });

  it('throws on invalid numImages', async () => {
    await expect(
      createBatchMagicEditTasks({
        project_id: 'proj-1',
        prompt: 'edit',
        image_url: 'https://example.com/image.jpg',
        numImages: 20,
      })
    ).rejects.toThrow('Number of images must be between 1 and 16');
  });

  it('throws on invalid max_wait_seconds', async () => {
    await expect(
      createBatchMagicEditTasks({
        project_id: 'proj-1',
        prompt: 'edit',
        image_url: 'https://example.com/image.jpg',
        numImages: 1,
        max_wait_seconds: 0,
      })
    ).rejects.toThrow('Max wait seconds must be positive');
  });
});
