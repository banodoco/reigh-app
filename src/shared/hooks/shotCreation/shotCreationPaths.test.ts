import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyAtomicShotCacheUpdate: vi.fn(),
}));

vi.mock('./shotCacheUpdate', () => ({
  applyAtomicShotCacheUpdate: (...args: unknown[]) => mocks.applyAtomicShotCacheUpdate(...args),
}));

import {
  createEmptyShotPath,
  createShotWithFilesPath,
  createShotWithGenerationPath,
} from './shotCreationPaths';

describe('shotCreationPaths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a shot from an existing generation and updates the optimistic cache', async () => {
    const createShotWithImage = vi.fn().mockResolvedValue({
      shotId: 'shot-1',
      shotName: 'Shot 1',
      shotGenerationId: 'shot-gen-1',
    });

    const result = await createShotWithGenerationPath({
      selectedProjectId: 'project-1',
      shotName: 'Seed Shot',
      generationId: 'generation-1',
      generationPreview: { imageUrl: 'preview.png' },
      shots: [{ id: 'shot-0' }] as never,
      queryClient: { id: 'query-client' } as never,
      createShotWithImage,
    });

    expect(createShotWithImage).toHaveBeenCalledWith({
      projectId: 'project-1',
      shotName: 'Seed Shot',
      generationId: 'generation-1',
    });
    expect(mocks.applyAtomicShotCacheUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedProjectId: 'project-1',
        shotId: 'shot-1',
        shotName: 'Shot 1',
        shotGenerationId: 'shot-gen-1',
        generationId: 'generation-1',
      }),
    );
    expect(result).toEqual({
      shotId: 'shot-1',
      shotName: 'Shot 1',
      generationIds: ['generation-1'],
    });
  });

  it('creates a shot from uploaded files and returns uploaded generation ids', async () => {
    const createShot = vi.fn().mockResolvedValue({
      shot: { id: 'shot-2', name: 'Uploads' },
    });
    const uploadToShot = vi.fn().mockResolvedValue({
      shotId: 'shot-2',
      generationIds: ['gen-a', 'gen-b'],
    });
    const onProgress = vi.fn();
    const files = [new File(['a'], 'a.png', { type: 'image/png' })];

    const result = await createShotWithFilesPath({
      selectedProjectId: 'project-1',
      shotName: 'Uploads',
      files,
      aspectRatio: '16:9',
      shots: [{ id: 'shot-0' }] as never,
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
    expect(result).toEqual({
      shotId: 'shot-2',
      shotName: 'Uploads',
      shot: { id: 'shot-2', name: 'Uploads' },
      generationIds: ['gen-a', 'gen-b'],
    });
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
