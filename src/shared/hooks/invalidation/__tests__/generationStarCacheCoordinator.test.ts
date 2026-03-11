import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import {
  applyOptimisticGenerationStarUpdate,
  rollbackOptimisticGenerationStarUpdate,
} from '../generationStarCacheCoordinator';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

describe('generationStarCacheCoordinator', () => {
  it('cancels relevant query families before applying optimistic updates', async () => {
    const queryClient = createQueryClient();
    const cancelQueriesSpy = vi.spyOn(queryClient, 'cancelQueries');
    const generationId = 'gen-1';
    const shotId = 'shot-1';
    const projectId = 'project-1';
    const unifiedKey = queryKeys.unified.byProject(projectId, 1, 50, null, false);
    const shotsKey = queryKeys.shots.list(projectId);
    const byShotKey = queryKeys.generations.byShot(shotId);

    queryClient.setQueryData(unifiedKey, {
      items: [{ id: generationId, starred: false }, { id: 'gen-2', starred: false }],
    });
    queryClient.setQueryData(shotsKey, [
      {
        id: shotId,
        name: 'Shot 1',
        images: [{ id: generationId, starred: false }, { id: 'gen-2', starred: false }],
      },
    ]);
    queryClient.setQueryData(byShotKey, [
      { id: generationId, starred: false },
      { id: 'gen-2', starred: false },
    ]);

    const context = await applyOptimisticGenerationStarUpdate(queryClient, {
      generationId,
      starred: true,
      shotId,
    });

    expect(cancelQueriesSpy).toHaveBeenCalledTimes(3);
    expect(cancelQueriesSpy).toHaveBeenNthCalledWith(1, { queryKey: queryKeys.unified.all });
    expect(cancelQueriesSpy).toHaveBeenNthCalledWith(2, { queryKey: queryKeys.shots.all });
    expect(cancelQueriesSpy).toHaveBeenNthCalledWith(3, { queryKey: queryKeys.generations.byShotAll });
    expect((queryClient.getQueryData(unifiedKey) as { items: Array<{ id: string; starred: boolean }> }).items[0]?.starred).toBe(true);
    expect((queryClient.getQueryData(shotsKey) as Array<{ images: Array<{ id: string; starred: boolean }> }>)[0]?.images[0]?.starred).toBe(true);
    expect((queryClient.getQueryData(byShotKey) as Array<{ id: string; starred: boolean }>)[0]?.starred).toBe(true);
    expect(context.previousGenerationsQueries.size).toBe(1);
    expect(context.previousShotsQueries.size).toBe(1);
    expect(context.previousAllShotGenerationsQueries.size).toBe(1);
  });

  it('skips nonmatching cache shapes and leaves by-shot caches untouched when shotId is absent', async () => {
    const queryClient = createQueryClient();
    const generationId = 'gen-1';
    const invalidUnifiedKey = queryKeys.unified.byProject('project-1', 1, 50, null, false);
    const invalidShotsKey = queryKeys.shots.list('project-1');
    const byShotKey = queryKeys.generations.byShot('shot-1');
    const invalidUnifiedData = { pages: [{ id: generationId, starred: false }] };
    const invalidShotsData = { id: 'not-an-array' };
    const byShotData = [{ id: generationId, starred: false }];

    queryClient.setQueryData(invalidUnifiedKey, invalidUnifiedData);
    queryClient.setQueryData(invalidShotsKey, invalidShotsData);
    queryClient.setQueryData(byShotKey, byShotData);

    const context = await applyOptimisticGenerationStarUpdate(queryClient, {
      generationId,
      starred: true,
    });

    expect(queryClient.getQueryData(invalidUnifiedKey)).toBe(invalidUnifiedData);
    expect(queryClient.getQueryData(invalidShotsKey)).toBe(invalidShotsData);
    expect(queryClient.getQueryData(byShotKey)).toBe(byShotData);
    expect(context.previousGenerationsQueries.size).toBe(0);
    expect(context.previousShotsQueries.size).toBe(0);
    expect(context.previousAllShotGenerationsQueries.size).toBe(0);
  });

  it('rolls back every captured cache entry to its original state', async () => {
    const queryClient = createQueryClient();
    const generationId = 'gen-1';
    const shotId = 'shot-1';
    const projectId = 'project-1';
    const unifiedKey = queryKeys.unified.byProject(projectId, 1, 50, null, false);
    const secondUnifiedKey = queryKeys.unified.byProject(projectId, 2, 50, null, false);
    const shotsKey = queryKeys.shots.list(projectId);
    const secondShotsKey = queryKeys.shots.list(projectId, 100);
    const byShotKey = queryKeys.generations.byShot(shotId);
    const originalUnifiedData = {
      items: [{ id: generationId, starred: false }],
    };
    const secondUnifiedData = {
      items: [{ id: generationId, starred: false }, { id: 'gen-2', starred: false }],
    };
    const originalShotsData = [
      {
        id: shotId,
        name: 'Shot 1',
        images: [{ id: generationId, starred: false }],
      },
    ];
    const secondShotsData = [
      {
        id: shotId,
        name: 'Shot 1',
        images: [{ id: generationId, starred: false }, { id: 'gen-2', starred: false }],
      },
    ];
    const originalByShotData = [{ id: generationId, starred: false }];

    queryClient.setQueryData(unifiedKey, originalUnifiedData);
    queryClient.setQueryData(secondUnifiedKey, secondUnifiedData);
    queryClient.setQueryData(shotsKey, originalShotsData);
    queryClient.setQueryData(secondShotsKey, secondShotsData);
    queryClient.setQueryData(byShotKey, originalByShotData);

    const context = await applyOptimisticGenerationStarUpdate(queryClient, {
      generationId,
      starred: true,
      shotId,
    });

    expect((queryClient.getQueryData(unifiedKey) as { items: Array<{ starred: boolean }> }).items[0]?.starred).toBe(true);
    expect((queryClient.getQueryData(secondUnifiedKey) as { items: Array<{ starred: boolean }> }).items[0]?.starred).toBe(true);
    expect((queryClient.getQueryData(shotsKey) as Array<{ images: Array<{ starred: boolean }> }>)[0]?.images[0]?.starred).toBe(true);
    expect((queryClient.getQueryData(secondShotsKey) as Array<{ images: Array<{ starred: boolean }> }>)[0]?.images[0]?.starred).toBe(true);
    expect((queryClient.getQueryData(byShotKey) as Array<{ starred: boolean }>)[0]?.starred).toBe(true);

    rollbackOptimisticGenerationStarUpdate(queryClient, context);

    expect(queryClient.getQueryData(unifiedKey)).toEqual(originalUnifiedData);
    expect(queryClient.getQueryData(secondUnifiedKey)).toEqual(secondUnifiedData);
    expect(queryClient.getQueryData(shotsKey)).toEqual(originalShotsData);
    expect(queryClient.getQueryData(secondShotsKey)).toEqual(secondShotsData);
    expect(queryClient.getQueryData(byShotKey)).toEqual(originalByShotData);
  });
});
