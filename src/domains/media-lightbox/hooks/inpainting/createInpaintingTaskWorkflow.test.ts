import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInpaintingTaskWorkflow } from './createInpaintingTaskWorkflow';

const mockCreateImageInpaintTask = vi.fn();

vi.mock('@/shared/lib/tasks/imageEditing/imageInpaint', () => ({
  createImageInpaintTask: (...args: unknown[]) => mockCreateImageInpaintTask(...args),
}));

describe('createInpaintingTaskWorkflow', () => {
  beforeEach(() => {
    mockCreateImageInpaintTask.mockReset();
  });

  it('maps annotated overlay output to the canonical typed mask capability', async () => {
    mockCreateImageInpaintTask.mockResolvedValue({ task_id: 'task-1', status: 'pending' });

    const taskId = await createInpaintingTaskWorkflow({
      taskType: 'annotate',
      media: {
        id: 'media-1',
        imageUrl: 'https://example.com/source.png',
        location: null,
      } as never,
      selectedProjectId: 'proj-1',
      activeVariantId: 'variant-1',
      qwenEditModel: 'qwen-edit-2511',
      inpaintPrompt: 'annotate this region',
      inpaintNumGenerations: 1,
      actualGenerationId: 'gen-1',
      strokeOverlay: {
        exportMask: () => 'data:image/png;base64,mask',
      } as never,
    });

    expect(taskId).toBe('task-1');
    expect(mockCreateImageInpaintTask).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'proj-1',
      image_url: 'https://example.com/source.png',
      mask_url: 'data:image/png;base64,mask',
      prompt: 'annotate this region',
      num_generations: 1,
      generation_id: 'gen-1',
      source_variant_id: 'variant-1',
      edit_kind: 'annotated_edit',
      qwen_edit_model: 'qwen-edit-2511',
    }));
  });

  it('fails before task creation when the overlay has no mask', async () => {
    await expect(createInpaintingTaskWorkflow({
      taskType: 'inpaint',
      media: { imageUrl: 'https://example.com/source.png', location: null } as never,
      selectedProjectId: 'proj-1',
      inpaintPrompt: 'fill the region',
      inpaintNumGenerations: 1,
      actualGenerationId: 'gen-1',
      strokeOverlay: { exportMask: () => null } as never,
    })).rejects.toThrow('did not produce a mask');
    expect(mockCreateImageInpaintTask).not.toHaveBeenCalled();
  });
});
