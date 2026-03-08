import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBatchZImageTurboImageToImageTasks } from '../zImageTurboI2I';

const mockCreateTask = vi.fn();
const mockProcessBatchResults = vi.fn();

vi.mock('../../taskCreation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../taskCreation')>();
  return {
    ...actual,
    createTask: (...args: unknown[]) => mockCreateTask(...args),
    validateRequiredFields: (params: Record<string, unknown>, fields: string[]) => {
      for (const field of fields) {
        if (params[field] === undefined || params[field] === null) {
          throw new TVE(`${field} is required`, field);
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
  };
});

// Local alias for throw
class TVE extends Error {
  field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = 'TaskValidationError';
    this.field = field;
  }
}

describe('createBatchZImageTurboImageToImageTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTask.mockResolvedValue({ task_id: 'task-1', status: 'pending' });
    mockProcessBatchResults.mockImplementation((results: PromiseSettledResult<unknown>[]) => {
      return results
        .filter((r): r is PromiseFulfilledResult<unknown> => r.status === 'fulfilled')
        .map(r => r.value);
    });
  });

  it('creates a single task with defaults', async () => {
    await createBatchZImageTurboImageToImageTasks({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      numImages: 1,
    });

    expect(mockCreateTask).toHaveBeenCalledOnce();

    const call = mockCreateTask.mock.calls[0][0];
    expect(call.project_id).toBe('proj-1');
    expect(call.task_type).toBe('z_image_turbo_i2i');
    expect(call.params.image_url).toBe('https://example.com/image.jpg');
    expect(call.params.prompt).toBe('');
    expect(call.params.strength).toBe(0.6);
    expect(call.params.enable_prompt_expansion).toBe(false);
    expect(call.params.num_images).toBe(1);
    expect(call.params.image_size).toBe('auto');
    expect(call.params.num_inference_steps).toBe(8);
    expect(call.params.output_format).toBe('png');
    expect(call.params.acceleration).toBe('high');
    expect(call.params.add_in_position).toBe(false);
  });

  it('creates multiple tasks in parallel', async () => {
    mockCreateTask
      .mockResolvedValueOnce({ task_id: 'task-1', status: 'pending' })
      .mockResolvedValueOnce({ task_id: 'task-2', status: 'pending' })
      .mockResolvedValueOnce({ task_id: 'task-3', status: 'pending' });

    await createBatchZImageTurboImageToImageTasks({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      numImages: 3,
    });

    expect(mockCreateTask).toHaveBeenCalledTimes(3);
    // Each task has num_images=1 (one per task)
    mockCreateTask.mock.calls.forEach(([call]) => {
      expect(call.params.num_images).toBe(1);
    });
  });

  it('passes custom params through', async () => {
    await createBatchZImageTurboImageToImageTasks({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      numImages: 1,
      prompt: 'make it blue',
      strength: 0.8,
      enable_prompt_expansion: true,
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.prompt).toBe('make it blue');
    expect(params.strength).toBe(0.8);
    expect(params.enable_prompt_expansion).toBe(true);
  });

  it('includes lineage tracking fields', async () => {
    await createBatchZImageTurboImageToImageTasks({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      numImages: 1,
      based_on: 'gen-original',
      source_variant_id: 'var-1',
      create_as_generation: true,
      shot_id: 'shot-1',
      tool_type: 'custom-tool',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.based_on).toBe('gen-original');
    expect(params.source_variant_id).toBe('var-1');
    expect(params.create_as_generation).toBe(true);
    expect(params.shot_id).toBe('shot-1');
    expect(params.tool_type).toBe('custom-tool');
  });

  it('sets acceleration to "none" when loras provided', async () => {
    await createBatchZImageTurboImageToImageTasks({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      numImages: 1,
      loras: [{ path: 'https://example.com/lora.safetensors', scale: 0.5 }],
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.acceleration).toBe('none');
    expect(params.loras).toEqual([
      { path: 'https://example.com/lora.safetensors', scale: 0.5 },
    ]);
  });

  it('uses "high" acceleration without loras', async () => {
    await createBatchZImageTurboImageToImageTasks({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      numImages: 1,
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.acceleration).toBe('high');
    expect(params.loras).toBeUndefined();
  });

  it('defaults lora scale to 1.0', async () => {
    await createBatchZImageTurboImageToImageTasks({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      numImages: 1,
      loras: [{ path: 'https://example.com/lora.safetensors' }],
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.loras[0].scale).toBe(1.0);
  });

  it('includes seed when provided and increments per task', async () => {
    // Mock Math.random to not be called (seed is explicitly provided)
    await createBatchZImageTurboImageToImageTasks({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      numImages: 3,
      seed: 100,
    });

    // seed should be 100, 101, 102 (base + index)
    const seeds = mockCreateTask.mock.calls.map(([call]) => call.params.seed);
    expect(seeds).toEqual([100, 101, 102]);
  });

  it('throws on empty image URL', async () => {
    await expect(
      createBatchZImageTurboImageToImageTasks({
        project_id: 'proj-1',
        image_url: '   ',
        numImages: 1,
      })
    ).rejects.toThrow();
  });

  it('throws on invalid URL format', async () => {
    await expect(
      createBatchZImageTurboImageToImageTasks({
        project_id: 'proj-1',
        image_url: 'not-a-url',
        numImages: 1,
      })
    ).rejects.toThrow('Image URL must be a valid URL');
  });

  it('throws on strength out of range', async () => {
    await expect(
      createBatchZImageTurboImageToImageTasks({
        project_id: 'proj-1',
        image_url: 'https://example.com/image.jpg',
        numImages: 1,
        strength: 1.5,
      })
    ).rejects.toThrow('Strength must be between 0 and 1');
  });

  it('throws on numImages out of range', async () => {
    await expect(
      createBatchZImageTurboImageToImageTasks({
        project_id: 'proj-1',
        image_url: 'https://example.com/image.jpg',
        numImages: 20,
      })
    ).rejects.toThrow('Number of images must be between 1 and 16');
  });

  it('throws on invalid lora path', async () => {
    await expect(
      createBatchZImageTurboImageToImageTasks({
        project_id: 'proj-1',
        image_url: 'https://example.com/image.jpg',
        numImages: 1,
        loras: [{ path: '', scale: 1.0 }],
      })
    ).rejects.toThrow('LoRA 1: path is required');
  });

  it('throws on lora scale out of range', async () => {
    await expect(
      createBatchZImageTurboImageToImageTasks({
        project_id: 'proj-1',
        image_url: 'https://example.com/image.jpg',
        numImages: 1,
        loras: [{ path: 'https://example.com/lora.safetensors', scale: 3.0 }],
      })
    ).rejects.toThrow('LoRA 1: scale must be between 0 and 2');
  });

  // Seed validation is not performed by the function — negative seeds are passed through
});
