import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { shotQueryKeys } from '@/shared/lib/queryKeys/shots';
import { applyAtomicShotCacheUpdate } from './shotCacheUpdate';

describe('applyAtomicShotCacheUpdate', () => {
  it('adds an optimistic shot to the list caches and initializes the detail cache', () => {
    const queryClient = new QueryClient();
    const existingShots = [
      {
        id: 'shot-1',
        name: 'Shot 1',
        images: [],
        project_id: 'project-1',
        position: 4,
        created_at: '2026-03-11T00:00:00.000Z',
      },
    ] as never;

    queryClient.setQueryData(shotQueryKeys.list('project-1', 0), existingShots);
    queryClient.setQueryData(shotQueryKeys.list('project-1', 5), existingShots);
    queryClient.setQueryData([...shotQueryKeys.all, 'project-1'], existingShots);

    applyAtomicShotCacheUpdate({
      selectedProjectId: 'project-1',
      shotId: 'shot-2',
      shotName: 'Shot 2',
      shotGenerationId: 'shot-gen-2',
      generationId: 'generation-2',
      generationPreview: {
        imageUrl: 'image.png',
        thumbUrl: 'thumb.png',
        type: 'image',
        location: 'storage/image.png',
      },
      shots: existingShots,
      queryClient,
    });

    const updatedList = queryClient.getQueryData(shotQueryKeys.list('project-1', 0)) as Array<Record<string, unknown>>;
    const detail = queryClient.getQueryData(shotQueryKeys.detail('shot-2')) as Record<string, unknown>;

    expect(updatedList).toHaveLength(2);
    expect(updatedList[1]).toEqual(
      expect.objectContaining({
        id: 'shot-2',
        name: 'Shot 2',
        project_id: 'project-1',
        position: 5,
      }),
    );
    expect((updatedList[1].images as Array<Record<string, unknown>>)[0]).toEqual(
      expect.objectContaining({
        id: 'shot-gen-2',
        generation_id: 'generation-2',
        imageUrl: 'image.png',
        thumbUrl: 'thumb.png',
        isOptimistic: true,
      }),
    );
    expect(detail).toEqual(
      expect.objectContaining({
        id: 'shot-2',
        name: 'Shot 2',
        project_id: 'project-1',
      }),
    );
  });

  it('leaves list caches unchanged when the shot already exists', () => {
    const queryClient = new QueryClient();
    const existingShots = [
      {
        id: 'shot-2',
        name: 'Shot 2',
        images: [],
        project_id: 'project-1',
        position: 2,
        created_at: '2026-03-11T00:00:00.000Z',
      },
    ] as never;

    queryClient.setQueryData(shotQueryKeys.list('project-1', 0), existingShots);

    applyAtomicShotCacheUpdate({
      selectedProjectId: 'project-1',
      shotId: 'shot-2',
      shotName: 'Shot 2',
      shotGenerationId: 'shot-gen-2',
      generationId: 'generation-2',
      shots: existingShots,
      queryClient,
    });

    const updatedList = queryClient.getQueryData(shotQueryKeys.list('project-1', 0));
    expect(updatedList).toBe(existingShots);
  });
});
