import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBoundedImageEditTask, createImageInpaintTask, IMAGE_EDIT_CAPABILITY_ID } from '../imageInpaint';

const {
  mockCreateTask,
  mockIngestProjectInputFromUrl,
  mockResolveTaskCapability,
  mockGalleryGet,
} = vi.hoisted(() => ({
  mockCreateTask: vi.fn(),
  mockIngestProjectInputFromUrl: vi.fn(),
  mockResolveTaskCapability: vi.fn(),
  mockGalleryGet: vi.fn(),
}));

vi.mock('../../../taskCreation', () => ({
  createTask: (...args: unknown[]) => mockCreateTask(...args),
  ingestProjectInputFromUrl: (...args: unknown[]) => mockIngestProjectInputFromUrl(...args),
  resolveTaskCapability: (...args: unknown[]) => mockResolveTaskCapability(...args),
}));

vi.mock('@/integrations/astrid/client', () => ({
  AstridLocalClient: class {
    gallery = { get: (...args: unknown[]) => mockGalleryGet(...args) };
  },
}));

describe('createImageInpaintTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGalleryGet.mockReset();
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
      settlement_effect: {},
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

  it('binds ordinary Magic Edit to the selected source variant and generation version', async () => {
    mockGalleryGet.mockResolvedValue({
      generation_id: 'gen-1',
      project_id: 'proj-1',
      version: 7,
      variants: [
        { id: 'variant-primary', is_primary: true, object_id: `sha256:${'b'.repeat(64)}` },
        { id: 'variant-selected', is_primary: false, object_id: `sha256:${'b'.repeat(64)}` },
      ],
    });

    await createBoundedImageEditTask('proj-1', {
      sourceUrl: 'https://example.com/selected.png',
      prompt: 'remove the sign',
      count: 1,
      qwenEditModel: 'qwen-edit-2511',
      basedOn: 'gen-1',
      sourceVariantId: 'variant-selected',
    });

    expect(mockGalleryGet).toHaveBeenCalledWith('gen-1');
    expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({
      settlement_effect: {
        effect_type: 'generation.variant.append',
        target_id: 'gen-1',
        expected_version: 7,
        payload: {
          source_variant_id: 'variant-selected',
          source_object_id: `sha256:${'b'.repeat(64)}`,
          variant_type: 'magic_edit',
          output_name: 'generated_images',
          output_ordinal: 0,
          primary_policy: 'preserve',
        },
      },
    }));
  });

  it('falls back to the primary CAS variant when no variant is selected', async () => {
    mockGalleryGet.mockResolvedValue({
      generation_id: 'gen-primary',
      project_id: 'proj-1',
      version: 2,
      variants: [{ id: 'variant-primary', is_primary: true, object_id: `sha256:${'b'.repeat(64)}` }],
    });

    await createBoundedImageEditTask('proj-1', {
      sourceUrl: 'https://example.com/source.png',
      prompt: 'edit primary',
      count: 1,
      qwenEditModel: 'qwen-edit-2511',
      basedOn: 'gen-primary',
    });

    expect(mockCreateTask).toHaveBeenCalledWith(expect.objectContaining({
      settlement_effect: expect.objectContaining({
        payload: expect.objectContaining({ source_variant_id: 'variant-primary' }),
      }),
    }));
  });

  it('fails closed for missing version, unknown variant, or missing CAS identity', async () => {
    mockGalleryGet.mockResolvedValueOnce({ generation_id: 'gen-missing-version', variants: [] });
    await expect(createBoundedImageEditTask('proj-1', {
      sourceUrl: 'https://example.com/source.png', prompt: 'edit', count: 1,
      qwenEditModel: 'qwen-edit-2511', basedOn: 'gen-missing-version',
    })).rejects.toThrow('no usable version');

    mockGalleryGet.mockResolvedValueOnce({
      generation_id: 'gen-unknown', version: 1,
      variants: [{ id: 'variant-known', is_primary: true, object_id: `sha256:${'b'.repeat(64)}` }],
    });
    await expect(createBoundedImageEditTask('proj-1', {
      sourceUrl: 'https://example.com/source.png', prompt: 'edit', count: 1,
      qwenEditModel: 'qwen-edit-2511', basedOn: 'gen-unknown', sourceVariantId: 'variant-absent',
    })).rejects.toThrow('no source variant');

    mockGalleryGet.mockResolvedValueOnce({
      generation_id: 'gen-no-object', version: 1,
      variants: [{ id: 'variant-no-object', is_primary: true }],
    });
    await expect(createBoundedImageEditTask('proj-1', {
      sourceUrl: 'https://example.com/source.png', prompt: 'edit', count: 1,
      qwenEditModel: 'qwen-edit-2511', basedOn: 'gen-no-object',
    })).rejects.toThrow('does not expose a CAS object identity');

    expect(mockResolveTaskCapability).not.toHaveBeenCalled();
    expect(mockIngestProjectInputFromUrl).not.toHaveBeenCalled();
  });

  it('rejects a source digest mismatch before task creation', async () => {
    mockGalleryGet.mockResolvedValue({
      generation_id: 'gen-mismatch',
      version: 1,
      variants: [{ id: 'variant-mismatch', is_primary: true, object_id: `sha256:${'c'.repeat(64)}` }],
    });

    await expect(createBoundedImageEditTask('proj-1', {
      sourceUrl: 'https://example.com/source.png', prompt: 'edit', count: 1,
      qwenEditModel: 'qwen-edit-2511', basedOn: 'gen-mismatch',
    })).rejects.toThrow('does not match the admitted source bytes');
    expect(mockCreateTask).not.toHaveBeenCalled();
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
    expect(mockResolveTaskCapability).not.toHaveBeenCalled();
    expect(mockIngestProjectInputFromUrl).not.toHaveBeenCalled();
  });
});
