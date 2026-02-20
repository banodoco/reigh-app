import { describe, it, expect, vi } from 'vitest';
import { debugPolling } from './debugPolling';

describe('debugPolling', () => {
  it('inspects React Query cache using provided query client API', () => {
    const queryClient = {
      getQueriesData: vi.fn((input: unknown) => [input]),
    };

    const result = debugPolling.inspectReactQueryCache(
      queryClient as unknown as { getQueriesData: (input: unknown) => unknown },
      'project-1',
    );

    expect(Array.isArray(result.taskStatusQueries)).toBe(true);
    expect(Array.isArray(result.paginatedTaskQueries)).toBe(true);
    expect(queryClient.getQueriesData).toHaveBeenCalledTimes(2);
  });

  it('runs full diagnostic with stubbed async checks', async () => {
    const testConnectionSpy = vi.spyOn(debugPolling, 'testConnection').mockResolvedValue(true);
    const testTaskStatusSpy = vi.spyOn(debugPolling, 'testTaskStatusQuery').mockResolvedValue(false);
    const inspectSpy = vi.spyOn(debugPolling, 'inspectReactQueryCache').mockReturnValue({
      taskStatusQueries: [],
      paginatedTaskQueries: [],
    });

    const result = await debugPolling.runFullDiagnostic('project-1', {
      getQueriesData: vi.fn(),
    } as unknown as { getQueriesData: (input: unknown) => unknown });

    expect(result.connectionOk).toBe(true);
    expect(result.queryOk).toBe(false);
    expect(typeof result.visibilityState).toBe('string');
    expect(testConnectionSpy).toHaveBeenCalled();
    expect(testTaskStatusSpy).toHaveBeenCalled();
    expect(inspectSpy).toHaveBeenCalled();
  });
});
