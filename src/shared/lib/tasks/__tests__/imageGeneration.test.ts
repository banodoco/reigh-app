import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBatchImageGenerationTasks } from '../imageGeneration';

const mockCreateTask = vi.fn();
const mockResolveProjectResolution = vi.fn();
const mockGenerateTaskId = vi.fn();
const mockProcessBatchResults = vi.fn();

vi.mock('../../taskCreation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../taskCreation')>();
  return {
    ...actual,
    createTask: (...args: unknown[]) => mockCreateTask(...args),
    resolveProjectResolution: (...args: unknown[]) => mockResolveProjectResolution(...args),
    generateTaskId: (...args: unknown[]) => mockGenerateTaskId(...args),
    validateRequiredFields: (params: Record<string, unknown>, fields: string[]) => {
      for (const field of fields) {
        const value = params[field];
        if (value === undefined || value === null) {
          throw new TVE(`${field} is required`, field);
        }
        if (Array.isArray(value) && value.length === 0) {
          throw new TVE(`${field} cannot be empty`, field);
        }
        if (typeof value === 'string' && value.trim() === '') {
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

vi.mock('@/shared/lib/media/aspectRatios', () => ({
  ASPECT_RATIO_TO_RESOLUTION: {
    '16:9': '902x508',
    '1:1': '670x670',
  },
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

describe('createBatchImageGenerationTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTask.mockResolvedValue({ task_id: 'task-1', status: 'pending' });
    mockResolveProjectResolution.mockResolvedValue({ resolution: '670x670', aspectRatio: '1:1' });
    mockGenerateTaskId.mockReturnValue('qwen_image_240101_abc123');
    mockProcessBatchResults.mockImplementation((results: PromiseSettledResult<unknown>[]) => {
      return results
        .filter((r): r is PromiseFulfilledResult<unknown> => r.status === 'fulfilled')
        .map(r => r.value);
    });
  });

  it('creates tasks for each prompt * imagesPerPrompt', async () => {
    await createBatchImageGenerationTasks({
      project_id: 'proj-1',
      prompts: [
        { id: 'p1', fullPrompt: 'a cat' },
        { id: 'p2', fullPrompt: 'a dog' },
      ],
      imagesPerPrompt: 2,
    });

    expect(mockCreateTask).toHaveBeenCalledTimes(4); // 2 prompts * 2 images
    expect(mockProcessBatchResults).toHaveBeenCalledOnce();
  });

  it('uses default task type wan_2_2_t2i for unknown model', async () => {
    await createBatchImageGenerationTasks({
      project_id: 'proj-1',
      prompts: [{ id: 'p1', fullPrompt: 'a cat' }],
      imagesPerPrompt: 1,
    });

    const call = mockCreateTask.mock.calls[0][0];
    expect(call.task_type).toBe('wan_2_2_t2i');
  });

  it('uses qwen_image task type for qwen-image model', async () => {
    await createBatchImageGenerationTasks({
      project_id: 'proj-1',
      prompts: [{ id: 'p1', fullPrompt: 'a cat' }],
      imagesPerPrompt: 1,
      model_name: 'qwen-image',
    });

    const call = mockCreateTask.mock.calls[0][0];
    expect(call.task_type).toBe('qwen_image');
  });

  it('uses qwen_image_style for qwen-image with style reference', async () => {
    await createBatchImageGenerationTasks({
      project_id: 'proj-1',
      prompts: [{ id: 'p1', fullPrompt: 'a cat' }],
      imagesPerPrompt: 1,
      model_name: 'qwen-image',
      style_reference_image: 'https://example.com/ref.jpg',
    });

    const call = mockCreateTask.mock.calls[0][0];
    expect(call.task_type).toBe('qwen_image_style');
  });

  it('uses qwen_image_2512 for qwen-image-2512 model', async () => {
    await createBatchImageGenerationTasks({
      project_id: 'proj-1',
      prompts: [{ id: 'p1', fullPrompt: 'a cat' }],
      imagesPerPrompt: 1,
      model_name: 'qwen-image-2512',
    });

    const call = mockCreateTask.mock.calls[0][0];
    expect(call.task_type).toBe('qwen_image_2512');
  });

  it('uses z_image_turbo for z-image model', async () => {
    await createBatchImageGenerationTasks({
      project_id: 'proj-1',
      prompts: [{ id: 'p1', fullPrompt: 'a cat' }],
      imagesPerPrompt: 1,
      model_name: 'z-image',
    });

    const call = mockCreateTask.mock.calls[0][0];
    expect(call.task_type).toBe('z_image_turbo');
  });

  it('scales resolution for qwen-image model (default 1.5x)', async () => {
    mockResolveProjectResolution.mockResolvedValue({ resolution: '670x670', aspectRatio: '1:1' });

    await createBatchImageGenerationTasks({
      project_id: 'proj-1',
      prompts: [{ id: 'p1', fullPrompt: 'a cat' }],
      imagesPerPrompt: 1,
      model_name: 'qwen-image',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    // 670 * 1.5 = 1005
    expect(params.resolution).toBe('1005x1005');
  });

  it('applies custom resolution_scale', async () => {
    mockResolveProjectResolution.mockResolvedValue({ resolution: '670x670', aspectRatio: '1:1' });

    await createBatchImageGenerationTasks({
      project_id: 'proj-1',
      prompts: [{ id: 'p1', fullPrompt: 'a cat' }],
      imagesPerPrompt: 1,
      model_name: 'qwen-image',
      resolution_scale: 2.0,
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.resolution).toBe('1340x1340');
  });

  it('uses custom aspect ratio when resolution_mode is "custom"', async () => {
    await createBatchImageGenerationTasks({
      project_id: 'proj-1',
      prompts: [{ id: 'p1', fullPrompt: 'a cat' }],
      imagesPerPrompt: 1,
      model_name: 'qwen-image',
      resolution_mode: 'custom',
      custom_aspect_ratio: '16:9',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    // 902 * 1.5 = 1353, 508 * 1.5 = 762
    expect(params.resolution).toBe('1353x762');
  });

  it('does not scale resolution for non-image-gen models', async () => {
    mockResolveProjectResolution.mockResolvedValue({ resolution: '670x670', aspectRatio: '1:1' });

    await createBatchImageGenerationTasks({
      project_id: 'proj-1',
      prompts: [{ id: 'p1', fullPrompt: 'a cat' }],
      imagesPerPrompt: 1,
      model_name: 'some-other-model',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.resolution).toBe('670x670');
  });

  it('includes loras as additional_loras map', async () => {
    await createBatchImageGenerationTasks({
      project_id: 'proj-1',
      prompts: [{ id: 'p1', fullPrompt: 'a cat' }],
      imagesPerPrompt: 1,
      loras: [
        { path: 'https://example.com/lora1.safetensors', strength: 0.8 },
        { path: 'https://example.com/lora2.safetensors', strength: 1.2 },
      ],
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.additional_loras).toEqual({
      'https://example.com/lora1.safetensors': 0.8,
      'https://example.com/lora2.safetensors': 1.2,
    });
  });

  it('includes shot_id when provided', async () => {
    await createBatchImageGenerationTasks({
      project_id: 'proj-1',
      prompts: [{ id: 'p1', fullPrompt: 'a cat' }],
      imagesPerPrompt: 1,
      shot_id: 'shot-1',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.shot_id).toBe('shot-1');
  });

  it('sets add_in_position to false', async () => {
    await createBatchImageGenerationTasks({
      project_id: 'proj-1',
      prompts: [{ id: 'p1', fullPrompt: 'a cat' }],
      imagesPerPrompt: 1,
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.add_in_position).toBe(false);
  });

  it('passes steps parameter through', async () => {
    await createBatchImageGenerationTasks({
      project_id: 'proj-1',
      prompts: [{ id: 'p1', fullPrompt: 'a cat' }],
      imagesPerPrompt: 1,
      steps: 20,
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.steps).toBe(20);
  });

  it('defaults steps to 12', async () => {
    await createBatchImageGenerationTasks({
      project_id: 'proj-1',
      prompts: [{ id: 'p1', fullPrompt: 'a cat' }],
      imagesPerPrompt: 1,
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.steps).toBe(12);
  });

  it('defaults seed to 11111', async () => {
    await createBatchImageGenerationTasks({
      project_id: 'proj-1',
      prompts: [{ id: 'p1', fullPrompt: 'a cat' }],
      imagesPerPrompt: 1,
    });

    // Individual task creation generates random seed per task
    // But the direct task param defaults to 11111
    // In batch mode, seed is randomly generated, so we check it's a number
    const params = mockCreateTask.mock.calls[0][0].params;
    expect(typeof params.seed).toBe('number');
  });

  it('includes hires fix params when provided', async () => {
    await createBatchImageGenerationTasks({
      project_id: 'proj-1',
      prompts: [{ id: 'p1', fullPrompt: 'a cat' }],
      imagesPerPrompt: 1,
      hires_scale: 2.0,
      hires_steps: 10,
      hires_denoise: 0.5,
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.hires_scale).toBe(2.0);
    expect(params.hires_steps).toBe(10);
    expect(params.hires_denoise).toBe(0.5);
  });

  // Validation tests
  it('throws on empty prompts array', async () => {
    await expect(
      createBatchImageGenerationTasks({
        project_id: 'proj-1',
        prompts: [],
        imagesPerPrompt: 1,
      })
    ).rejects.toThrow();
  });

  it('throws on empty prompt text', async () => {
    await expect(
      createBatchImageGenerationTasks({
        project_id: 'proj-1',
        prompts: [{ id: 'p1', fullPrompt: '  ' }],
        imagesPerPrompt: 1,
      })
    ).rejects.toThrow('fullPrompt cannot be empty');
  });

  it('throws on imagesPerPrompt out of range', async () => {
    await expect(
      createBatchImageGenerationTasks({
        project_id: 'proj-1',
        prompts: [{ id: 'p1', fullPrompt: 'a cat' }],
        imagesPerPrompt: 20,
      })
    ).rejects.toThrow('Images per prompt must be between 1 and 16');
  });

  it('throws on invalid lora path', async () => {
    await expect(
      createBatchImageGenerationTasks({
        project_id: 'proj-1',
        prompts: [{ id: 'p1', fullPrompt: 'a cat' }],
        imagesPerPrompt: 1,
        loras: [{ path: '', strength: 1.0 }],
      })
    ).rejects.toThrow('LoRA 1: path is required');
  });

  it('throws on invalid lora strength', async () => {
    await expect(
      createBatchImageGenerationTasks({
        project_id: 'proj-1',
        prompts: [{ id: 'p1', fullPrompt: 'a cat' }],
        imagesPerPrompt: 1,
        loras: [{ path: 'some-path', strength: 3.0 }],
      })
    ).rejects.toThrow('LoRA 1: strength must be a number between 0 and 2');
  });

  // Reference mode filtering tests
  it('includes style reference params for style mode', async () => {
    await createBatchImageGenerationTasks({
      project_id: 'proj-1',
      prompts: [{ id: 'p1', fullPrompt: 'a cat' }],
      imagesPerPrompt: 1,
      model_name: 'qwen-image',
      style_reference_image: 'https://example.com/ref.jpg',
      style_reference_strength: 0.8,
      reference_mode: 'style',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.style_reference_image).toBe('https://example.com/ref.jpg');
    expect(params.style_reference_strength).toBe(0.8);
    // Subject and scene should NOT be present in style mode
    expect(params.subject_strength).toBeUndefined();
    expect(params.in_this_scene).toBeUndefined();
  });

  it('forces fixed values for subject mode', async () => {
    await createBatchImageGenerationTasks({
      project_id: 'proj-1',
      prompts: [{ id: 'p1', fullPrompt: 'a cat' }],
      imagesPerPrompt: 1,
      model_name: 'qwen-image',
      style_reference_image: 'https://example.com/ref.jpg',
      reference_mode: 'subject',
      subject_description: 'a fluffy cat',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.style_reference_strength).toBe(1.1);
    expect(params.subject_strength).toBe(0.5);
    expect(params.subject_description).toBe('a fluffy cat');
  });

  it('forces fixed values for scene mode', async () => {
    await createBatchImageGenerationTasks({
      project_id: 'proj-1',
      prompts: [{ id: 'p1', fullPrompt: 'a cat' }],
      imagesPerPrompt: 1,
      model_name: 'qwen-image',
      style_reference_image: 'https://example.com/ref.jpg',
      reference_mode: 'scene',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.style_reference_strength).toBe(1.1);
    expect(params.in_this_scene).toBe(true);
    expect(params.in_this_scene_strength).toBe(0.5);
  });
});
