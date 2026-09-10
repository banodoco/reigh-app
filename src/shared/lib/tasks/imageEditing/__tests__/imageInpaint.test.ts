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

  it('fails closed before task creation because the published edit capability is source-only', async () => {
    await expect(createImageInpaintTask({
      project_id: 'proj-1',
      image_url: 'https://example.com/image.jpg',
      mask_url: 'https://example.com/mask.png',
      prompt: 'remove the car',
      num_generations: 1,
    })).rejects.toThrow('mask-capable edit capability');
    expect(mockCreateTask).not.toHaveBeenCalled();
    expect(mockResolveTaskCapability).not.toHaveBeenCalled();
    expect(mockIngestProjectInputFromUrl).not.toHaveBeenCalled();
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
      { maxBytes: 512_000, requireImage: true },
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
