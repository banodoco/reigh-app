import { describe, it, expect, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { Shot, GenerationRow } from '@/domains/generation/types';
import {
  updateAllShotsCaches,
  rollbackShotsCaches,
  cancelShotsQueries,
  findShotsCache,
  rollbackShotGenerationsCache,
  cancelShotGenerationsQuery,
} from '../cacheUtils';
import { queryKeys } from '@/shared/lib/queryKeys';

describe('cacheUtils', () => {
  let queryClient: QueryClient;
  const projectId = 'project-123';

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
  });

  // Helper to create a minimal shot
  const createShot = (id: string, position = 0): Shot =>
    ({
      id,
      name: `Shot ${id}`,
      position,
      project_id: projectId,
      images: [],
    } as unknown as Shot);

  // Helper to create a minimal generation row
  const createGenerationRow = (id: string, frame: number | null = 0): GenerationRow =>
    ({
      id,
      generation_id: `gen-${id}`,
      timeline_frame: frame,
      location: 'https://example.com/image.png',
    } as unknown as GenerationRow);

  // ============================================================================
  // updateAllShotsCaches
  // ============================================================================

  describe('updateAllShotsCaches', () => {
    it('creates cache entries for all variants when they do not exist', () => {
      const shots = [createShot('shot-1'), createShot('shot-2')];
      updateAllShotsCaches(queryClient, projectId, () => shots);

      // Check the base key variant
      const baseData = queryClient.getQueryData<Shot[]>([...queryKeys.shots.all, projectId]);
      expect(baseData).toEqual(shots);

      // Check specific variant (maxImages=0)
      const variant0 = queryClient.getQueryData<Shot[]>(queryKeys.shots.list(projectId, 0));
      expect(variant0).toEqual(shots);
    });

    it('updates existing cache entries', () => {
      const initialShots = [createShot('shot-1')];
      // Pre-populate one cache variant
      queryClient.setQueryData(queryKeys.shots.list(projectId, 0), initialShots);

      const updatedShots = [createShot('shot-1'), createShot('shot-2')];
      updateAllShotsCaches(queryClient, projectId, () => updatedShots);

      const result = queryClient.getQueryData<Shot[]>(queryKeys.shots.list(projectId, 0));
      expect(result).toEqual(updatedShots);
    });

    it('respects onlyExisting flag', () => {
      // Only populate one variant
      const initialShots = [createShot('shot-1')];
      queryClient.setQueryData(queryKeys.shots.list(projectId, 0), initialShots);

      const updatedShots = [createShot('shot-1'), createShot('shot-2')];
      updateAllShotsCaches(queryClient, projectId, () => updatedShots, true);

      // The populated variant should be updated
      const populatedResult = queryClient.getQueryData<Shot[]>(queryKeys.shots.list(projectId, 0));
      expect(populatedResult).toEqual(updatedShots);

      // Unpopulated variants should remain undefined
      const unpopulatedResult = queryClient.getQueryData<Shot[]>(queryKeys.shots.list(projectId, 2));
      expect(unpopulatedResult).toBeUndefined();
    });

    it('passes old data to updater function', () => {
      const initialShots = [createShot('shot-1')];
      queryClient.setQueryData(queryKeys.shots.list(projectId, 0), initialShots);

      updateAllShotsCaches(queryClient, projectId, (old) => {
        return [...(old || []), createShot('shot-2')];
      });

      const result = queryClient.getQueryData<Shot[]>(queryKeys.shots.list(projectId, 0));
      expect(result).toHaveLength(2);
      expect(result![0].id).toBe('shot-1');
      expect(result![1].id).toBe('shot-2');
    });
  });

  // ============================================================================
  // rollbackShotsCaches
  // ============================================================================

  describe('rollbackShotsCaches', () => {
    it('restores all cache variants to previous state', () => {
      const previousShots = [createShot('shot-1')];
      const currentShots = [createShot('shot-1'), createShot('shot-2')];

      // Set current state
      updateAllShotsCaches(queryClient, projectId, () => currentShots);

      // Rollback
      rollbackShotsCaches(queryClient, projectId, previousShots);

      const result = queryClient.getQueryData<Shot[]>(queryKeys.shots.list(projectId, 0));
      expect(result).toEqual(previousShots);
    });

    it('does nothing when previous is undefined', () => {
      const currentShots = [createShot('shot-1')];
      queryClient.setQueryData(queryKeys.shots.list(projectId, 0), currentShots);

      rollbackShotsCaches(queryClient, projectId, undefined);

      // Should not change
      const result = queryClient.getQueryData<Shot[]>(queryKeys.shots.list(projectId, 0));
      expect(result).toEqual(currentShots);
    });
  });

  // ============================================================================
  // findShotsCache
  // ============================================================================

  describe('findShotsCache', () => {
    it('returns the first non-empty cache', () => {
      const shots = [createShot('shot-1')];
      // Only populate one variant
      queryClient.setQueryData(queryKeys.shots.list(projectId, 2), shots);

      const result = findShotsCache(queryClient, projectId);
      expect(result).toEqual(shots);
    });

    it('returns undefined when no cache has data', () => {
      const result = findShotsCache(queryClient, projectId);
      expect(result).toBeUndefined();
    });

    it('skips empty arrays', () => {
      queryClient.setQueryData([...queryKeys.shots.all, projectId], []);
      const shots = [createShot('shot-1')];
      queryClient.setQueryData(queryKeys.shots.list(projectId, 0), shots);

      const result = findShotsCache(queryClient, projectId);
      expect(result).toEqual(shots);
    });
  });

  // ============================================================================
  // cancelShotsQueries
  // ============================================================================

  describe('cancelShotsQueries', () => {
    it('does not throw', async () => {
      await expect(cancelShotsQueries(queryClient, projectId)).resolves.not.toThrow();
    });
  });

  // ============================================================================
  // rollbackShotGenerationsCache
  // ============================================================================

  describe('rollbackShotGenerationsCache', () => {
    const shotId = 'shot-1';

    it('restores shot-generations cache to previous state', () => {
      const previous = [createGenerationRow('sg-1', 0), createGenerationRow('sg-2', 50)];
      const current = [createGenerationRow('sg-1', 0)]; // missing sg-2

      queryClient.setQueryData(queryKeys.generations.byShot(shotId), current);
      rollbackShotGenerationsCache(queryClient, shotId, previous);

      const result = queryClient.getQueryData<GenerationRow[]>(queryKeys.generations.byShot(shotId));
      expect(result).toEqual(previous);
    });

    it('does nothing when previous is undefined', () => {
      const current = [createGenerationRow('sg-1', 0)];
      queryClient.setQueryData(queryKeys.generations.byShot(shotId), current);

      rollbackShotGenerationsCache(queryClient, shotId, undefined);

      const result = queryClient.getQueryData<GenerationRow[]>(queryKeys.generations.byShot(shotId));
      expect(result).toEqual(current);
    });
  });

  // ============================================================================
  // cancelShotGenerationsQuery
  // ============================================================================

  describe('cancelShotGenerationsQuery', () => {
    it('does not throw', async () => {
      await expect(cancelShotGenerationsQuery(queryClient, 'shot-1')).resolves.not.toThrow();
    });
  });
});
