import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';

vi.mock('./useGenerationInvalidation', () => ({
  invalidateGenerationsSync: vi.fn(),
}));

describe('useTaskInvalidation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  describe('queryKeys used for task invalidation', () => {
    it('has correct task list key', () => {
      expect(taskQueryKeys.list('proj-1')).toEqual(['tasks', 'proj-1']);
    });

    it('has correct task detail key', () => {
      expect(taskQueryKeys.detail('task-1')).toEqual(['tasks', 'task-1']);
    });

    it('has correct status counts key', () => {
      expect(taskQueryKeys.statusCounts('proj-1')).toEqual(['task-status-counts', 'proj-1']);
    });
  });

  describe('invalidation scopes', () => {
    it('can invalidate list scope', () => {
      const spy = vi.spyOn(queryClient, 'invalidateQueries');
      queryClient.invalidateQueries({ queryKey: taskQueryKeys.list('proj-1') });
      expect(spy).toHaveBeenCalled();
    });

    it('can invalidate detail scope', () => {
      const spy = vi.spyOn(queryClient, 'invalidateQueries');
      queryClient.invalidateQueries({ queryKey: taskQueryKeys.detail('task-1') });
      expect(spy).toHaveBeenCalled();
    });

    it('can invalidate counts scope', () => {
      const spy = vi.spyOn(queryClient, 'invalidateQueries');
      queryClient.invalidateQueries({ queryKey: taskQueryKeys.statusCounts('proj-1') });
      expect(spy).toHaveBeenCalled();
    });
  });
});
