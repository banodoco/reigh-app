import { beforeEach, describe, it, expect, vi } from 'vitest';

const bridgeMocks = vi.hoisted(() => ({
  listPage: vi.fn(),
  listBridgeTasks: vi.fn(),
  isRootBridgeTask: vi.fn(),
}));

vi.mock('@/integrations/astrid/bridgeTaskReads', () => ({
  getBridgeTaskClient: () => ({ tasks: { list: bridgeMocks.listPage } }),
  listBridgeTasks: (...args: unknown[]) => bridgeMocks.listBridgeTasks(...args),
  isRootBridgeTask: (...args: unknown[]) => bridgeMocks.isRootBridgeTask(...args),
}));

import { debugPolling } from '../debug/debugPolling';

describe('debugPolling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeMocks.listPage.mockResolvedValue({ tasks: [], next_offset: null });
    bridgeMocks.listBridgeTasks.mockResolvedValue([]);
    bridgeMocks.isRootBridgeTask.mockReturnValue(true);
  });

  it('tests connectivity through one bounded bridge task page', async () => {
    await expect(debugPolling.testConnection('project-1')).resolves.toBe(true);

    expect(bridgeMocks.listPage).toHaveBeenCalledWith({ limit: 1, offset: 0 });
  });

  it('tests the active root-task read through the bridge task list', async () => {
    bridgeMocks.listBridgeTasks.mockResolvedValue([
      { status: 'Queued', params: { prompt: 'hello' } },
    ]);

    await expect(debugPolling.testTaskStatusQuery('project-1')).resolves.toBe(true);

    expect(bridgeMocks.listBridgeTasks).toHaveBeenCalledWith('project-1');
    expect(bridgeMocks.isRootBridgeTask).toHaveBeenCalledWith({ prompt: 'hello' });
  });

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
