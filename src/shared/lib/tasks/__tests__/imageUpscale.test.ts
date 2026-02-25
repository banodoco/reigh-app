import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createImageUpscaleTask } from '../imageUpscale';

// Mock taskCreation
const mockCreateTask = vi.fn();
vi.mock('../../taskCreation', () => ({
  createTask: (...args: unknown[]) => mockCreateTask(...args),
  validateRequiredFields: (params: Record<string, unknown>, fields: string[]) => {
    for (const field of fields) {
      if (params[field] === undefined || params[field] === null) {
        throw new TaskValidationErrorMock(`${field} is required`, field);
      }
    }
  },
  TaskValidationError: class TaskValidationError extends Error {
    field?: string;
    constructor(message: string, field?: string) {
      super(message);
      this.name = 'TaskValidationError';
      this.field = field;
    }
  },
}));

// Local reference to TaskValidationError for instanceof checks
class TaskValidationErrorMock extends Error {
  field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = 'TaskValidationError';
    this.field = field;
  }
}

vi.mock('@/shared/lib/compat/errorHandler', () => ({
  handleError: vi.fn(),
}));

describe('createImageUpscaleTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTask.mockResolvedValue({ task_id: 'test-task-id', status: 'pending' });
  });

  it('creates a basic upscale task with defaults', async () => {
    const result = await createImageUpscaleTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
    });

    expect(result).toEqual({ task_id: 'test-task-id', status: 'pending' });
    expect(mockCreateTask).toHaveBeenCalledOnce();

    const call = mockCreateTask.mock.calls[0][0];
    expect(call.project_id).toBe('proj-1');
    expect(call.task_type).toBe('image-upscale');
    expect(call.params.image).toBe('https://example.com/image.jpg');
    expect(call.params.scale_factor).toBe(2);
    expect(call.params.noise_scale).toBe(0.1);
    expect(call.params.output_format).toBe('jpeg');
  });

  it('includes generation_id, based_on, and is_primary when generation_id provided', async () => {
    await createImageUpscaleTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      generation_id: 'gen-123',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.generation_id).toBe('gen-123');
    expect(params.based_on).toBe('gen-123');
    expect(params.is_primary).toBe(true);
  });

  it('does not include generation_id fields when not provided', async () => {
    await createImageUpscaleTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.generation_id).toBeUndefined();
    expect(params.based_on).toBeUndefined();
    expect(params.is_primary).toBeUndefined();
  });

  it('includes source_variant_id when provided', async () => {
    await createImageUpscaleTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      source_variant_id: 'variant-456',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.source_variant_id).toBe('variant-456');
  });

  it('includes shot_id when provided', async () => {
    await createImageUpscaleTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      shot_id: 'shot-789',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.shot_id).toBe('shot-789');
  });

  it('uses custom scale_factor and noise_scale', async () => {
    await createImageUpscaleTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      scale_factor: 4,
      noise_scale: 0.5,
      output_format: 'png',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.scale_factor).toBe(4);
    expect(params.noise_scale).toBe(0.5);
    expect(params.output_format).toBe('png');
  });

  it('throws on empty image URL', async () => {
    await expect(
      createImageUpscaleTask({
        project_id: 'proj-1',
        image_url: '   ',
      })
    ).rejects.toThrow('Image URL cannot be empty');
  });

  it('throws on invalid URL format', async () => {
    await expect(
      createImageUpscaleTask({
        project_id: 'proj-1',
        image_url: 'not-a-valid-url',
      })
    ).rejects.toThrow('Image URL must be a valid URL');
  });

  it('throws on scale_factor out of range (too low)', async () => {
    await expect(
      createImageUpscaleTask({
        project_id: 'proj-1',
        image_url: 'https://example.com/image.jpg',
        scale_factor: 0,
      })
    ).rejects.toThrow('Scale factor must be between 1 and 8');
  });

  it('throws on scale_factor out of range (too high)', async () => {
    await expect(
      createImageUpscaleTask({
        project_id: 'proj-1',
        image_url: 'https://example.com/image.jpg',
        scale_factor: 10,
      })
    ).rejects.toThrow('Scale factor must be between 1 and 8');
  });

  it('rethrows createTask errors', async () => {
    mockCreateTask.mockRejectedValue(new Error('Network failure'));

    await expect(
      createImageUpscaleTask({
        project_id: 'proj-1',
        image_url: 'https://example.com/image.jpg',
      })
    ).rejects.toThrow('Network failure');
  });
});
