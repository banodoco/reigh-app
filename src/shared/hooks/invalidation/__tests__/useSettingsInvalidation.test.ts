import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';

describe('useSettingsInvalidation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  describe('queryKeys used for settings invalidation', () => {
    it('has correct tool settings key', () => {
      expect(queryKeys.settings.tool('travel', 'proj-1', 'shot-1')).toEqual([
        'toolSettings', 'travel', 'proj-1', 'shot-1',
      ]);
    });

    it('has correct pair metadata key', () => {
      expect(queryKeys.segments.pairMetadata('pair-1')).toEqual(['pair-metadata', 'pair-1']);
    });

    it('has correct user settings key', () => {
      expect(queryKeys.settings.user).toEqual(['user-settings']);
    });
  });

  describe('invalidation scopes', () => {
    it('can invalidate tool scope queries', () => {
      const spy = vi.spyOn(queryClient, 'invalidateQueries');
      queryClient.invalidateQueries({
        queryKey: queryKeys.settings.tool('travel', 'proj-1', 'shot-1'),
      });
      expect(spy).toHaveBeenCalled();
    });

    it('can invalidate pair scope queries', () => {
      const spy = vi.spyOn(queryClient, 'invalidateQueries');
      queryClient.invalidateQueries({
        queryKey: queryKeys.segments.pairMetadata('pair-1'),
      });
      expect(spy).toHaveBeenCalled();
    });

    it('can invalidate user scope queries', () => {
      const spy = vi.spyOn(queryClient, 'invalidateQueries');
      queryClient.invalidateQueries({
        queryKey: queryKeys.settings.user,
      });
      expect(spy).toHaveBeenCalled();
    });
  });
});
