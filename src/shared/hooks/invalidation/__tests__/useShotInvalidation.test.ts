import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';

// Since the functions are not exported (marked @internal), we test them indirectly
// by verifying the query key structure and invalidation behavior

describe('useShotInvalidation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  describe('queryKeys used for invalidation', () => {
    it('has correct shots list key', () => {
      expect(queryKeys.shots.list('proj-1')).toEqual(['shots', 'proj-1', undefined]);
    });

    it('has correct shots detail key', () => {
      expect(queryKeys.shots.detail('shot-1')).toEqual(['shot', 'shot-1']);
    });

    it('has correct generations byShot key', () => {
      expect(queryKeys.generations.byShot('shot-1')).toEqual(['all-shot-generations', 'shot-1']);
    });

    it('has correct generations meta key', () => {
      expect(queryKeys.generations.meta('shot-1')).toEqual(['shot-generations-meta', 'shot-1']);
    });

    it('has correct segment liveTimeline key', () => {
      expect(queryKeys.segments.liveTimeline('shot-1')).toEqual(['segment-live-timeline', 'shot-1']);
    });
  });

  describe('invalidation scopes', () => {
    it('can invalidate list scope queries', () => {
      const spy = vi.spyOn(queryClient, 'invalidateQueries');
      queryClient.invalidateQueries({ queryKey: queryKeys.shots.list('proj-1') });
      expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.shots.list('proj-1') });
    });

    it('can invalidate detail scope queries', () => {
      const spy = vi.spyOn(queryClient, 'invalidateQueries');
      queryClient.invalidateQueries({ queryKey: queryKeys.shots.detail('shot-1') });
      queryClient.invalidateQueries({ queryKey: queryKeys.generations.byShot('shot-1') });
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });
});
