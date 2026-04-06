import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enqueueGenerationsInvalidation: vi.fn(),
  invalidateShotsQueries: vi.fn(),
  upsertShotInCache: vi.fn(),
}));

vi.mock('@/shared/hooks/invalidation/useGenerationInvalidation', () => ({
  enqueueGenerationsInvalidation: (...args: unknown[]) => mocks.enqueueGenerationsInvalidation(...args),
}));

vi.mock('@/shared/hooks/shots/cacheUtils', () => ({
  invalidateShotsQueries: (...args: unknown[]) => mocks.invalidateShotsQueries(...args),
  upsertShotInCache: (...args: unknown[]) => mocks.upsertShotInCache(...args),
}));

import {
  createEmptyShotPath,
  createShotWithFilesPath,
  createShotWithGenerationPath,
  createShotWithGenerationsPath,
} from './shotCreationPaths';

describe('shotCreationPaths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a fully hydrated shot from a single generation and updates caches directly', async () => {
    const createShotWithGenerations = vi.fn().mockResolvedValue({
      shot_id: 'shot-1',
      shot_name: 'Shot 1',
      shot_position: 1,
      shot_generations: [
        {
          id: 'shot-gen-1',
          generation_id: 'generation-1',
          timeline_frame: 0,
          location: 'https://example.com/image-1.png',
          thumbnail_url: 'https://example.com/thumb-1.png',
          type: 'image',
          created_at: '2026-04-06T00:00:00.000Z',
          starred: false,
          name: 'Image 1',
          based_on: null,
          params: { prompt: 'seed' },
          primary_variant_id: 'variant-1',
        },
      ],
      success: true,
    });

    const result = await createShotWithGenerationPath({
      selectedProjectId: 'project-1',
      shotName: 'Seed Shot',
      generationId: 'generation-1',
      queryClient: { id: 'query-client' } as never,
      createShotWithGenerations,
    });

    expect(createShotWithGenerations).toHaveBeenCalledWith({
      projectId: 'project-1',
      shotName: 'Seed Shot',
      generationIds: ['generation-1'],
    });
    expect(mocks.upsertShotInCache).toHaveBeenCalledWith(
      { id: 'query-client' },
      'project-1',
      expect.objectContaining({
        id: 'shot-1',
        name: 'Shot 1',
        position: 1,
        imageCount: 1,
        positionedImageCount: 1,
        unpositionedImageCount: 0,
        hasUnpositionedImages: false,
        images: [
          expect.objectContaining({
            id: 'shot-gen-1',
            generation_id: 'generation-1',
            imageUrl: 'https://example.com/image-1.png',
            thumbUrl: 'https://example.com/thumb-1.png',
          }),
        ],
      }),
    );
    expect(mocks.enqueueGenerationsInvalidation).toHaveBeenCalledWith(
      { id: 'query-client' },
      'shot-1',
      expect.objectContaining({
        reason: 'create-shot-with-generations',
        includeShots: false,
        includeProjectUnified: true,
        projectId: 'project-1',
      }),
    );
    expect(mocks.invalidateShotsQueries).toHaveBeenCalledWith(
      { id: 'query-client' },
      'project-1',
      { refetchType: 'inactive' },
    );
    expect(result).toEqual({
      shotId: 'shot-1',
      shotName: 'Shot 1',
      shot: expect.objectContaining({
        id: 'shot-1',
        images: [expect.objectContaining({ generation_id: 'generation-1' })],
      }),
      generationIds: ['generation-1'],
    });
  });

  it('creates a shot from uploaded files, hydrates cache, and returns uploaded generation ids', async () => {
    const createShot = vi.fn().mockResolvedValue({
      shot: { id: 'shot-2', name: 'Uploads', project_id: 'project-1', position: 1 },
    });
    const uploadToShot = vi.fn().mockResolvedValue({
      shotId: 'shot-2',
      generationIds: ['gen-a', 'gen-b'],
      generationMetadata: [
        {
          generationId: 'gen-a',
          shot_generation_id: 'shot-gen-a',
          timeline_frame: 0,
          location: 'https://example.com/image-a.png',
          thumbnail_url: 'https://example.com/thumb-a.png',
          type: 'image',
          created_at: '2026-04-06T00:00:00.000Z',
          params: { prompt: 'alpha' },
          primary_variant_id: 'variant-a',
        },
        {
          generationId: 'gen-b',
          shot_generation_id: 'shot-gen-b',
          timeline_frame: 50,
          location: 'https://example.com/image-b.png',
          thumbnail_url: 'https://example.com/thumb-b.png',
          type: 'image',
          created_at: '2026-04-06T00:00:01.000Z',
          params: { prompt: 'beta' },
          primary_variant_id: 'variant-b',
        },
      ],
    });
    const onProgress = vi.fn();
    const files = [new File(['a'], 'a.png', { type: 'image/png' })];
    const queryClient = { id: 'query-client' } as never;

    const result = await createShotWithFilesPath({
      selectedProjectId: 'project-1',
      shotName: 'Uploads',
      files,
      aspectRatio: '16:9',
      shots: [{ id: 'shot-0' }] as never,
      queryClient,
      onProgress,
      createShot,
      uploadToShot,
    });

    expect(createShot).toHaveBeenCalledWith({
      name: 'Uploads',
      projectId: 'project-1',
      aspectRatio: '16:9',
      shouldSelectAfterCreation: false,
    });
    expect(uploadToShot).toHaveBeenCalledWith({
      imageFiles: files,
      targetShotId: 'shot-2',
      currentProjectQueryKey: 'project-1',
      currentShotCount: 1,
      onProgress,
    });
    expect(mocks.upsertShotInCache).toHaveBeenCalledWith(
      queryClient,
      'project-1',
      expect.objectContaining({
        id: 'shot-2',
        name: 'Uploads',
        imageCount: 2,
        positionedImageCount: 2,
        unpositionedImageCount: 0,
        hasUnpositionedImages: false,
        images: [
          expect.objectContaining({
            id: 'shot-gen-a',
            generation_id: 'gen-a',
            imageUrl: 'https://example.com/image-a.png',
            thumbUrl: 'https://example.com/thumb-a.png',
            timeline_frame: 0,
          }),
          expect.objectContaining({
            id: 'shot-gen-b',
            generation_id: 'gen-b',
            imageUrl: 'https://example.com/image-b.png',
            thumbUrl: 'https://example.com/thumb-b.png',
            timeline_frame: 50,
          }),
        ],
      }),
    );
    expect(mocks.enqueueGenerationsInvalidation).toHaveBeenCalledWith(
      queryClient,
      'shot-2',
      expect.objectContaining({
        reason: 'create-shot-with-files',
        includeShots: false,
        includeProjectUnified: true,
        projectId: 'project-1',
      }),
    );
    expect(mocks.invalidateShotsQueries).toHaveBeenCalledWith(
      queryClient,
      'project-1',
      { refetchType: 'inactive' },
    );
    expect(result).toEqual({
      shotId: 'shot-2',
      shotName: 'Uploads',
      shot: expect.objectContaining({
        id: 'shot-2',
        name: 'Uploads',
        images: [
          expect.objectContaining({ generation_id: 'gen-a' }),
          expect.objectContaining({ generation_id: 'gen-b' }),
        ],
      }),
      generationIds: ['gen-a', 'gen-b'],
    });
  });

  it('creates a fully hydrated shot from multiple generations without timer glue', async () => {
    const createShotWithGenerations = vi.fn().mockResolvedValue({
      shot_id: 'shot-3',
      shot_name: 'Shot 3',
      shot_position: 3,
      shot_generations: [
        {
          id: 'shot-gen-1',
          generation_id: 'gen-1',
          timeline_frame: 0,
          location: 'https://example.com/image-1.png',
          thumbnail_url: 'https://example.com/thumb-1.png',
          type: 'image',
          created_at: '2026-04-06T00:00:00.000Z',
          starred: false,
          name: 'Image 1',
          based_on: null,
          params: { prompt: 'first' },
          primary_variant_id: 'variant-1',
        },
        {
          id: 'shot-gen-2',
          generation_id: 'gen-2',
          timeline_frame: 50,
          location: 'https://example.com/image-2.png',
          thumbnail_url: 'https://example.com/thumb-2.png',
          type: 'image',
          created_at: '2026-04-06T00:00:01.000Z',
          starred: true,
          name: 'Image 2',
          based_on: 'seed',
          params: { prompt: 'second' },
          primary_variant_id: null,
        },
      ],
      success: true,
    });
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const result = await createShotWithGenerationsPath({
      selectedProjectId: 'project-1',
      shotName: 'Shot 3',
      generationIds: ['gen-1', 'gen-2'],
      queryClient: { id: 'query-client' } as never,
      createShotWithGenerations,
    });

    expect(createShotWithGenerations).toHaveBeenCalledWith({
      projectId: 'project-1',
      shotName: 'Shot 3',
      generationIds: ['gen-1', 'gen-2'],
    });
    expect(mocks.upsertShotInCache).toHaveBeenCalledWith(
      { id: 'query-client' },
      'project-1',
      expect.objectContaining({
        id: 'shot-3',
        name: 'Shot 3',
        position: 3,
        imageCount: 2,
        positionedImageCount: 2,
        unpositionedImageCount: 0,
        hasUnpositionedImages: false,
        images: [
          expect.objectContaining({
            id: 'shot-gen-1',
            generation_id: 'gen-1',
            imageUrl: 'https://example.com/image-1.png',
            thumbUrl: 'https://example.com/thumb-1.png',
            timeline_frame: 0,
            position: 0,
          }),
          expect.objectContaining({
            id: 'shot-gen-2',
            generation_id: 'gen-2',
            imageUrl: 'https://example.com/image-2.png',
            thumbUrl: 'https://example.com/thumb-2.png',
            timeline_frame: 50,
            position: 1,
          }),
        ],
      }),
    );
    expect(result).toEqual({
      shotId: 'shot-3',
      shotName: 'Shot 3',
      shot: expect.objectContaining({
        id: 'shot-3',
        name: 'Shot 3',
        images: [
          expect.objectContaining({ thumbUrl: 'https://example.com/thumb-1.png' }),
          expect.objectContaining({ thumbUrl: 'https://example.com/thumb-2.png' }),
        ],
      }),
      generationIds: ['gen-1', 'gen-2'],
    });
    expect(mocks.enqueueGenerationsInvalidation).toHaveBeenCalledWith(
      { id: 'query-client' },
      'shot-3',
      expect.objectContaining({
        reason: 'create-shot-with-generations',
        includeShots: false,
        includeProjectUnified: true,
        projectId: 'project-1',
      }),
    );
    expect(mocks.invalidateShotsQueries).toHaveBeenCalledWith(
      { id: 'query-client' },
      'project-1',
      { refetchType: 'inactive' },
    );
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
  });

  it('throws when createShot does not return a usable shot id', async () => {
    const createShot = vi.fn().mockResolvedValue({ shot: undefined });

    await expect(
      createEmptyShotPath({
        selectedProjectId: 'project-1',
        shotName: 'Empty Shot',
        createShot,
      }),
    ).rejects.toThrow('Shot creation failed - no ID returned');
  });
});
