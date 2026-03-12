import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveSettingsScopeTable: vi.fn(),
  selectSettingsForScope: vi.fn(),
  callUpdateToolSettingsAtomicRpc: vi.fn(),
  initializeSettingsWriteQueue: vi.fn(),
  enqueueSettingsWrite: vi.fn(),
  deepMerge: vi.fn(),
  isCancellationError: vi.fn(),
}));

vi.mock('@/shared/lib/toolSettingsWriteRepository', () => ({
  resolveSettingsScopeTable: (...args: unknown[]) => mocks.resolveSettingsScopeTable(...args),
  selectSettingsForScope: (...args: unknown[]) => mocks.selectSettingsForScope(...args),
  callUpdateToolSettingsAtomicRpc: (...args: unknown[]) => mocks.callUpdateToolSettingsAtomicRpc(...args),
}));

vi.mock('@/shared/lib/settingsWriteQueue', () => ({
  initializeSettingsWriteQueue: (...args: unknown[]) => mocks.initializeSettingsWriteQueue(...args),
  enqueueSettingsWrite: (...args: unknown[]) => mocks.enqueueSettingsWrite(...args),
}));

vi.mock('@/shared/lib/utils/deepEqual', () => ({
  deepMerge: (...args: unknown[]) => mocks.deepMerge(...args),
}));

vi.mock('@/shared/lib/errorHandling/errorUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/errorHandling/errorUtils')>();
  return {
    ...actual,
    isCancellationError: (...args: unknown[]) => mocks.isCancellationError(...args),
  };
});

import {
  initializeToolSettingsWriteRuntime,
  updateToolSettingsSupabase,
} from './toolSettingsWriteService';

describe('toolSettingsWriteService', () => {
  beforeEach(() => {
    mocks.resolveSettingsScopeTable.mockReset();
    mocks.selectSettingsForScope.mockReset();
    mocks.callUpdateToolSettingsAtomicRpc.mockReset();
    mocks.initializeSettingsWriteQueue.mockReset();
    mocks.enqueueSettingsWrite.mockReset();
    mocks.deepMerge.mockReset();
    mocks.isCancellationError.mockReset();

    mocks.resolveSettingsScopeTable.mockReturnValue('projects');
    mocks.selectSettingsForScope.mockResolvedValue({
      data: { settings: { timeline: { enabled: true, density: 'compact' } } },
      error: null,
    });
    mocks.callUpdateToolSettingsAtomicRpc.mockResolvedValue({ error: null });
    mocks.deepMerge.mockImplementation((...args: Record<string, unknown>[]) => Object.assign({}, ...args));
    mocks.isCancellationError.mockReturnValue(false);
  });

  it('initializes the settings write runtime with the real write handler', async () => {
    initializeToolSettingsWriteRuntime();

    expect(mocks.initializeSettingsWriteQueue).toHaveBeenCalledTimes(1);

    const writeFn = mocks.initializeSettingsWriteQueue.mock.calls[0][0] as (write: {
      scope: 'project';
      entityId: string;
      toolId: string;
      patch: Record<string, unknown>;
      signal?: AbortSignal;
    }) => Promise<Record<string, unknown>>;

    const result = await writeFn({
      scope: 'project',
      entityId: 'project-1',
      toolId: 'timeline',
      patch: { showGrid: true },
    });

    expect(mocks.resolveSettingsScopeTable).toHaveBeenCalledWith('project');
    expect(mocks.selectSettingsForScope).toHaveBeenCalledWith('project', 'project-1');
    expect(mocks.deepMerge).toHaveBeenCalledWith(
      {},
      { enabled: true, density: 'compact' },
      { showGrid: true },
    );
    expect(mocks.callUpdateToolSettingsAtomicRpc).toHaveBeenCalledWith(
      'projects',
      'project-1',
      'timeline',
      { enabled: true, density: 'compact', showGrid: true },
    );
    expect(result).toEqual({ enabled: true, density: 'compact', showGrid: true });
  });

  it('converts fetch exhaustion failures into recoverable network ToolSettingsErrors', async () => {
    initializeToolSettingsWriteRuntime();
    const writeFn = mocks.initializeSettingsWriteQueue.mock.calls[0][0] as (write: {
      scope: 'project';
      entityId: string;
      toolId: string;
      patch: Record<string, unknown>;
      signal?: AbortSignal;
    }) => Promise<Record<string, unknown>>;

    mocks.selectSettingsForScope.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Failed to fetch',
        code: 'ERR_INSUFFICIENT_RESOURCES',
      },
    });

    await expect(writeFn({
      scope: 'project',
      entityId: 'project-1',
      toolId: 'timeline',
      patch: { showGrid: true },
    })).rejects.toMatchObject({
      name: 'ToolSettingsError',
      code: 'network',
      recoverable: true,
    });
  });

  it('rejects aborted writes as recoverable cancellation errors', async () => {
    initializeToolSettingsWriteRuntime();
    const writeFn = mocks.initializeSettingsWriteQueue.mock.calls[0][0] as (write: {
      scope: 'project';
      entityId: string;
      toolId: string;
      patch: Record<string, unknown>;
      signal?: AbortSignal;
    }) => Promise<Record<string, unknown>>;
    const controller = new AbortController();
    controller.abort('stopped');

    await expect(writeFn({
      scope: 'project',
      entityId: 'project-1',
      toolId: 'timeline',
      patch: { showGrid: true },
      signal: controller.signal,
    })).rejects.toMatchObject({
      code: 'cancelled',
      recoverable: true,
    });
  });

  it('forwards the patch, scope, and optional mode/signal to the queue', async () => {
    mocks.enqueueSettingsWrite.mockResolvedValue({ showGrid: true });
    const controller = new AbortController();

    await updateToolSettingsSupabase({
      scope: 'user',
      id: 'user-1',
      toolId: 'timeline',
      patch: { showGrid: true },
    }, 'immediate');

    await updateToolSettingsSupabase({
      scope: 'shot',
      id: 'shot-1',
      toolId: 'timeline',
      patch: { showGrid: false },
    }, controller.signal, 'debounced');

    expect(mocks.enqueueSettingsWrite).toHaveBeenNthCalledWith(1, {
      scope: 'user',
      entityId: 'user-1',
      toolId: 'timeline',
      patch: { showGrid: true },
    }, 'immediate', expect.any(Function));
    expect(mocks.enqueueSettingsWrite).toHaveBeenNthCalledWith(2, {
      scope: 'shot',
      entityId: 'shot-1',
      toolId: 'timeline',
      patch: { showGrid: false },
      signal: controller.signal,
    }, 'debounced', expect.any(Function));
  });
});
