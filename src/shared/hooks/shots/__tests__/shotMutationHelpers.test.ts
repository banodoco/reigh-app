import {
  describe,
  it,
  expect,
  beforeEach
} from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { isQuotaOrServerError, optimisticallyRemoveFromUnifiedGenerations } from '../shotMutationHelpers';

describe('shotMutationHelpers', () => {
  describe('isQuotaOrServerError', () => {
    it('detects 500 errors', () => {
      expect(isQuotaOrServerError(new Error('Server error 500'))).toBe(true);
    });

    it('detects 502 errors', () => {
      expect(isQuotaOrServerError(new Error('Bad gateway 502'))).toBe(true);
    });

    it('detects 503 errors', () => {
      expect(isQuotaOrServerError(new Error('Service unavailable 503'))).toBe(true);
    });

    it('detects 504 errors', () => {
      expect(isQuotaOrServerError(new Error('Gateway timeout 504'))).toBe(true);
    });

    it('detects quota errors', () => {
      expect(isQuotaOrServerError(new Error('Quota exceeded'))).toBe(true);
    });

    it('detects limit errors', () => {
      expect(isQuotaOrServerError(new Error('Rate limit reached'))).toBe(true);
    });

    it('detects capacity errors', () => {
      expect(isQuotaOrServerError(new Error('At capacity'))).toBe(true);
    });

    it('returns false for normal errors', () => {
      expect(isQuotaOrServerError(new Error('Not found'))).toBe(false);
    });

    it('returns false for errors without message', () => {
      const error = new Error();
      error.message = '';
      expect(isQuotaOrServerError(error)).toBe(false);
    });
  });

  describe('optimisticallyRemoveFromUnifiedGenerations', () => {
    let queryClient: QueryClient;

    beforeEach(() => {
      queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
    });

    it('removes generation from no-shot filter views', () => {
      const queryKey = ['unified-generations', 'project', 'proj-1', 1, 20, { shotId: 'no-shot' }];
      queryClient.setQueryData(queryKey, {
        items: [
          { id: 'gen-1', generation_id: 'g1' },
          { id: 'gen-2', generation_id: 'g2' },
        ],
        total: 2,
      });

      const count = optimisticallyRemoveFromUnifiedGenerations(queryClient, 'proj-1', 'gen-1');
      const data = queryClient.getQueryData(queryKey) as { items: unknown[]; total: number };
      expect(data.items).toHaveLength(1);
      expect(data.total).toBe(1);
      expect(count).toBe(1);
    });

    it('does not remove from non-no-shot filter views', () => {
      const queryKey = ['unified-generations', 'project', 'proj-1', 1, 20, { shotId: 'shot-1' }];
      queryClient.setQueryData(queryKey, {
        items: [{ id: 'gen-1' }],
        total: 1,
      });

      const count = optimisticallyRemoveFromUnifiedGenerations(queryClient, 'proj-1', 'gen-1');
      const data = queryClient.getQueryData(queryKey) as { items: unknown[]; total: number };
      expect(data.items).toHaveLength(1);
      expect(count).toBe(0);
    });

    it('matches by generation_id field', () => {
      const queryKey = ['unified-generations', 'project', 'proj-1', 1, 20, { shotId: 'no-shot' }];
      queryClient.setQueryData(queryKey, {
        items: [
          { id: 'other-id', generation_id: 'gen-to-remove' },
        ],
        total: 1,
      });

      optimisticallyRemoveFromUnifiedGenerations(queryClient, 'proj-1', 'gen-to-remove');
      const data = queryClient.getQueryData(queryKey) as { items: unknown[]; total: number };
      expect(data.items).toHaveLength(0);
      expect(data.total).toBe(0);
    });

    it('returns 0 when no matching queries exist', () => {
      const count = optimisticallyRemoveFromUnifiedGenerations(queryClient, 'proj-1', 'gen-1');
      expect(count).toBe(0);
    });
  });
});
