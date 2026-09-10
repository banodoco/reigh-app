import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBoundedImageEditTask, createImageInpaintTask, IMAGE_EDIT_CAPABILITY_ID } from '../imageInpaint';

const mockCreateTask = vi.fn();
const mockIngestProjectInputFromUrl = vi.fn();
const mockResolveTaskCapability = vi.fn();

vi.mock('../../../taskCreation', () => ({
  createTask: (...args: unknown[]) => mockCreateTask(...args),
  ingestProjectInputFromUrl: (...args: unknown[]) => mockIngestProjectInputFromUrl(...args),
  resolveTaskCapability: (...args: unknown[]) => mockResolveTaskCapability(...args),
}));

describe('createImageInpaintTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTask.mockResolvedValue({ task_id: 'task-1', status: 'pending' });
    mockResolveTaskCapability.mockResolvedValue({
      definition_digest: `sha256:${'a'.repeat(64)}`,
      estimated_scratch_bytes: 136826880,
      estimated_output_bytes: 68157440,
    });
    mockIngestProjectInputFromUrl.mockResolvedValue({
      object_id: `sha256:${'b'.repeat(64)}`,
      media_type: 'image/png',
      filename: 'source.png',
      size: 123,
      receipt: {},
    });
  });

  it('creates a single inpaint task with correct shape', async () => {
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
    expect(call.family).toBe('masked_edit');
    expect(call.input.task_type).toBe('image_inpaint');
    expect(call.input.image_url).toBe('https://example.com/image.jpg');
    expect(call.input.mask_url).toBe('https://example.com/mask.png');
    expect(call.input.prompt).toBe('remove the car');
    expect(call.input.num_generations).toBe(1);
  });

  it('passes generation_id in input when provided', async () => {
    await createImageInpaintTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      mask_url: 'https://example.com/mask.png',
      prompt: 'fix this',
      num_generations: 1,
      generation_id: 'gen-100',
    });

    const input = mockCreateTask.mock.calls[0][0].input;
    expect(input.generation_id).toBe('gen-100');
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

    const input = mockCreateTask.mock.calls[0][0].input;
    expect(input.shot_id).toBe('shot-1');
    expect(input.tool_type).toBe('inpaint');
    expect(input.loras).toEqual([{ path: 'lora-path', scale: 0.8 }]);
    expect(input.create_as_generation).toBe(true);
    expect(input.source_variant_id).toBe('var-1');
    expect(input.qwen_edit_model).toBe('qwen-edit-2511');
  });

  it('omits optional fields when not provided', async () => {
    await createImageInpaintTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      mask_url: 'https://example.com/mask.png',
      prompt: 'edit',
      num_generations: 1,
    });

    const input = mockCreateTask.mock.calls[0][0].input;
    expect(input.shot_id).toBeUndefined();
    expect(input.tool_type).toBeUndefined();
    expect(input.loras).toBeUndefined();
    expect(input.create_as_generation).toBeUndefined();
    expect(input.source_variant_id).toBeUndefined();
    expect(input.qwen_edit_model).toBeUndefined();
  });

  it('makes a single createTask call even when num_generations > 1', async () => {
    const result = await createImageInpaintTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      mask_url: 'https://example.com/mask.png',
      prompt: 'batch edit',
      num_generations: 3,
    });

    // Backend handles batching — only one createTask call is made
    expect(mockCreateTask).toHaveBeenCalledOnce();
    expect(mockCreateTask.mock.calls[0][0].input.num_generations).toBe(3);
    expect(result).toBe('task-1');
  });

  it('passes hires_fix directly in input', async () => {
    const hiresConfig = { hires_scale: 2, hires_steps: 10 };

    await createImageInpaintTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      mask_url: 'https://example.com/mask.png',
      prompt: 'edit',
      num_generations: 1,
      hires_fix: hiresConfig,
    });

    const input = mockCreateTask.mock.calls[0][0].input;
    expect(input.hires_fix).toEqual({ hires_scale: 2, hires_steps: 10 });
  });

  it('admits the bounded source-only edit through ordered CAS custody', async () => {
    await createBoundedImageEditTask('proj-1', {
      sourceUrl: 'https://example.com/source.png',
      prompt: 'remove the sign',
      count: 1,
      qwenEditModel: 'qwen-edit-2511',
    });

    expect(mockResolveTaskCapability).toHaveBeenCalledWith('proj-1', IMAGE_EDIT_CAPABILITY_ID);
    expect(mockIngestProjectInputFromUrl).toHaveBeenCalledWith(
      'proj-1',
      'https://example.com/source.png',
      { maxBytes: 512_000 },
    );
    expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({
      capability_id: IMAGE_EDIT_CAPABILITY_ID,
      input_object_ids: [`sha256:${'b'.repeat(64)}`],
      storage_estimate: { scratch_bytes: 136826880, output_bytes: 68157440 },
      spec: expect.objectContaining({
        family: IMAGE_EDIT_CAPABILITY_ID,
        params: expect.objectContaining({
          model: 'qwen-image-edit-2511',
          mode: 'edit',
          execution: 'cloud',
          count: 1,
          size: '1024x1024',
          image_ref: { digest: `sha256:${'b'.repeat(64)}`, filename: 'source.png', media_type: 'image/png' },
        }),
      }),
    }));
  });

  it('rejects unsupported edit aliases and fan-out before capability lookup', async () => {
    await expect(createBoundedImageEditTask('proj-1', {
      sourceUrl: 'https://example.com/source.png',
      prompt: 'edit',
      count: 1,
      qwenEditModel: 'qwen-edit-2509',
    })).rejects.toThrow('not represented');
    await expect(createBoundedImageEditTask('proj-1', {
      sourceUrl: 'https://example.com/source.png',
      prompt: 'edit',
      count: 2,
      qwenEditModel: 'qwen-edit-2511',
    })).rejects.toThrow('exactly one output');
    await expect(createBoundedImageEditTask('proj-1', {
      sourceUrl: 'https://example.com/source.png',
      prompt: 'edit',
      count: 1,
      qwenEditModel: 'qwen-edit-2511',
      basedOn: 'gen-1',
    })).rejects.toThrow('atomic generation/variant lineage effect');
    expect(mockResolveTaskCapability).not.toHaveBeenCalled();
    expect(mockIngestProjectInputFromUrl).not.toHaveBeenCalled();
  });
});
