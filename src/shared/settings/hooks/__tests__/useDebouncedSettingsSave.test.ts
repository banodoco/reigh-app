import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  reportRuntimeError: vi.fn(),
}));

vi.mock('@/shared/hooks/settings/useToolSettings', () => ({
  updateToolSettingsSupabase: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/shared/lib/queryKeys', () => ({
  queryKeys: {
    settings: {
      tool: (...args: string[]) => ['settings', 'tool', ...args],
    },
    shots: {
      batchSettings: (id: string) => ['shots', 'batch-settings', id],
    },
  },
}));

import { useDebouncedSettingsSave } from '../useDebouncedSettingsSave';

type TestSettings = { prompt: string; mode: string };

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useDebouncedSettingsSave', () => {
  const mockSaveImmediate = vi.fn().mockResolvedValue(undefined);
  const mockGetLatestSettings = vi.fn().mockResolvedValue({ prompt: 'latest', mode: 'basic' });
  const mockCustomSave = vi.fn().mockResolvedValue(undefined);
  const mockOnFlush = vi.fn();

  const defaultOptions = {
    entityId: 'entity-1',
    debounceMs: 300,
    status: 'ready' as const,
    isCustomMode: false,
    scope: 'shot' as const,
    toolId: 'test-tool',
    projectId: 'project-1',
    customSaveRef: { current: mockCustomSave },
    onFlushRef: { current: mockOnFlush },
    saveImmediateRef: { current: mockSaveImmediate },
    getLatestSettings: mockGetLatestSettings,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('trackPendingUpdate stores pending settings and entity', () => {
    const { result } = renderHook(
      () => useDebouncedSettingsSave<TestSettings>(defaultOptions),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.trackPendingUpdate({ prompt: 'new', mode: 'advanced' }, 'entity-1');
    });

    expect(result.current.pendingSettingsRef.current).toEqual({ prompt: 'new', mode: 'advanced' });
    expect(result.current.pendingEntityIdRef.current).toBe('entity-1');
  });

  it('hasPendingFor returns true when pending matches entity', () => {
    const { result } = renderHook(
      () => useDebouncedSettingsSave<TestSettings>(defaultOptions),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.trackPendingUpdate({ prompt: 'test', mode: 'basic' }, 'entity-1');
    });

    expect(result.current.hasPendingFor('entity-1')).toBe(true);
    expect(result.current.hasPendingFor('entity-2')).toBe(false);
  });

  it('incrementEditVersion increments the counter', () => {
    const { result } = renderHook(
      () => useDebouncedSettingsSave<TestSettings>(defaultOptions),
      { wrapper: createWrapper() }
    );

    expect(result.current.editVersionRef.current).toBe(0);

    act(() => {
      result.current.incrementEditVersion();
    });
    expect(result.current.editVersionRef.current).toBe(1);

    act(() => {
      result.current.incrementEditVersion();
    });
    expect(result.current.editVersionRef.current).toBe(2);
  });

  it('clearPending resets all pending state', () => {
    const { result } = renderHook(
      () => useDebouncedSettingsSave<TestSettings>(defaultOptions),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.trackPendingUpdate({ prompt: 'test', mode: 'basic' }, 'entity-1');
      result.current.incrementEditVersion();
    });

    act(() => {
      result.current.clearPending();
    });

    expect(result.current.pendingSettingsRef.current).toBeNull();
    expect(result.current.pendingEntityIdRef.current).toBeNull();
    expect(result.current.editVersionRef.current).toBe(0);
  });

  it('scheduleSave does not schedule when status is idle', () => {
    const { result } = renderHook(
      () => useDebouncedSettingsSave<TestSettings>({
        ...defaultOptions,
        status: 'idle',
      }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.scheduleSave('entity-1');
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mockSaveImmediate).not.toHaveBeenCalled();
  });

  it('scheduleSave does not schedule when status is loading', () => {
    const { result } = renderHook(
      () => useDebouncedSettingsSave<TestSettings>({
        ...defaultOptions,
        status: 'loading',
      }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.scheduleSave('entity-1');
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mockSaveImmediate).not.toHaveBeenCalled();
  });

  it('scheduleSave triggers save after debounce when status is ready', async () => {
    const { result } = renderHook(
      () => useDebouncedSettingsSave<TestSettings>(defaultOptions),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.scheduleSave('entity-1');
    });

    // Before debounce fires
    expect(mockSaveImmediate).not.toHaveBeenCalled();

    // After debounce
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(mockGetLatestSettings).toHaveBeenCalled();
  });

  it('cancelPendingSave cancels scheduled save', async () => {
    const { result } = renderHook(
      () => useDebouncedSettingsSave<TestSettings>(defaultOptions),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.scheduleSave('entity-1');
    });

    act(() => {
      result.current.cancelPendingSave();
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // getLatestSettings should not be called since save was cancelled
    expect(mockGetLatestSettings).not.toHaveBeenCalled();
  });

  it('flushes pending settings on entity change via cleanup effect', async () => {
    const localCustomSave = vi.fn().mockResolvedValue(undefined);
    const localOnFlush = vi.fn();

    let entityId = 'entity-1';

    const { result, rerender } = renderHook(
      () => useDebouncedSettingsSave<TestSettings>({
        ...defaultOptions,
        entityId,
        isCustomMode: true,
        scope: 'shot',
        toolId: 'test-tool',
        projectId: 'project-1',
        customSaveRef: { current: localCustomSave },
        onFlushRef: { current: localOnFlush },
      }),
      { wrapper: createWrapper() }
    );

    // Track pending update for entity-1
    act(() => {
      result.current.trackPendingUpdate({ prompt: 'dirty', mode: 'basic' }, 'entity-1');
    });

    // Change entity — triggers cleanup effect which should flush
    entityId = 'entity-2';
    rerender();

    // Allow flush promise to settle
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    await act(async () => {});

    // Custom save should have been called with entity-1's pending data
    expect(localCustomSave).toHaveBeenCalledWith('entity-1', { prompt: 'dirty', mode: 'basic' });
    // onFlush callback should fire after save completes
    expect(localOnFlush).toHaveBeenCalledWith('entity-1', { prompt: 'dirty', mode: 'basic' });
  });

  it('does not flush when no pending settings exist', async () => {
    const localCustomSave = vi.fn().mockResolvedValue(undefined);

    let entityId = 'entity-1';

    const { rerender } = renderHook(
      () => useDebouncedSettingsSave<TestSettings>({
        ...defaultOptions,
        entityId,
        isCustomMode: true,
        scope: 'shot',
        toolId: 'test-tool',
        projectId: 'project-1',
        customSaveRef: { current: localCustomSave },
      }),
      { wrapper: createWrapper() }
    );

    // Change entity without any pending updates
    entityId = 'entity-2';
    rerender();

    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    await act(async () => {});

    // Custom save should NOT have been called
    expect(localCustomSave).not.toHaveBeenCalled();
  });
});
