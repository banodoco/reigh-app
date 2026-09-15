import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  ingestProjectInputFromUrl: vi.fn(),
  resolveTaskCapability: vi.fn(),
  galleryGet: vi.fn(),
}));

vi.mock('@/shared/lib/taskCreation/createTask', () => ({
  createTask: mocks.createTask,
  ingestProjectInputFromUrl: mocks.ingestProjectInputFromUrl,
  resolveTaskCapability: mocks.resolveTaskCapability,
}));

vi.mock('@/integrations/astrid/client', () => ({
  AstridLocalClient: class {
    gallery = { get: mocks.galleryGet };
  },
}));
import {
  createTravelGenerationTask,
  TRAVEL_GENERATION_CAPABILITY_ID,
} from './travelGeneration';

describe('canonical travel generation admission seam', () => {
  it('admits one ordered FLF pair with CAS custody and lineage settlement', async () => {
    mocks.resolveTaskCapability.mockResolvedValue({
      definition_digest: `sha256:${'a'.repeat(64)}`,
      estimated_scratch_bytes: 100,
      estimated_output_bytes: 200,
    });
    mocks.galleryGet.mockResolvedValue({
      version: 3,
      variants: [{ id: 'source-variant', object_id: `sha256:${'1'.repeat(64)}`, is_primary: true }],
    });
    mocks.ingestProjectInputFromUrl
      .mockResolvedValueOnce({ object_id: `sha256:${'1'.repeat(64)}`, media_type: 'image/png', size: 10, filename: 'start.png' })
      .mockResolvedValueOnce({ object_id: `sha256:${'2'.repeat(64)}`, media_type: 'image/png', size: 11, filename: 'end.png' });
    mocks.createTask.mockResolvedValue({ task_id: 'task-1', status: 'Queued' });

    await expect(createTravelGenerationTask({
      project: 'project-1',
      startUrl: 'https://example.com/start.png',
      endUrl: 'https://example.com/end.png',
      prompt: 'smooth transition',
      frames: 49,
      fps: 16,
      basedOnGenerationId: 'generation-1',
      sourceVariantId: 'source-variant',
    })).resolves.toMatchObject({ task_id: 'task-1' });

    expect(mocks.createTask).toHaveBeenCalledWith(expect.objectContaining({
      capability_id: TRAVEL_GENERATION_CAPABILITY_ID,
      input_object_ids: [`sha256:${'1'.repeat(64)}`, `sha256:${'2'.repeat(64)}`],
      spec: expect.objectContaining({
        params: expect.objectContaining({
          mode: 'flf',
          image_ref: expect.objectContaining({ digest: `sha256:${'1'.repeat(64)}` }),
          image_end_ref: expect.objectContaining({ digest: `sha256:${'2'.repeat(64)}` }),
        }),
      }),
      settlement_effect: expect.objectContaining({
        expected_version: 3,
        payload: expect.objectContaining({ source_variant_id: 'source-variant' }),
      }),
    }));
  });

  it('requires lineage before ingest or admission', async () => {
    mocks.ingestProjectInputFromUrl.mockClear();
    mocks.createTask.mockClear();
    await expect(createTravelGenerationTask({
      project: 'project-1',
      startUrl: 'https://example.com/start.png',
      endUrl: 'https://example.com/end.png',
      prompt: 'smooth transition',
      frames: 49,
    })).rejects.toThrow('source generation for atomic variant settlement');
    expect(mocks.ingestProjectInputFromUrl).not.toHaveBeenCalled();
    expect(mocks.createTask).not.toHaveBeenCalled();
  });
});
