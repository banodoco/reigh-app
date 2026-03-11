// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCustomModeLoad,
  useReactQueryModeLoad,
} from './autoSaveSettingsLoaders';

const normalizeAndPresentErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => normalizeAndPresentErrorMock(...args),
}));

describe('autoSaveSettingsLoaders', () => {
  beforeEach(() => {
    normalizeAndPresentErrorMock.mockReset();
  });

  it('short-circuits custom mode loads when pending edits already exist for the entity', () => {
    const transitionReadyWithPendingSave = vi.fn();
    const customLoad = vi.fn();

    renderHook(() => useCustomModeLoad({
      isCustomMode: true,
      entityId: 'entity-1',
      enabled: true,
      statusRef: { current: 'idle' },
      defaults: { prompt: 'default' },
      debouncedSave: {
        hasPendingFor: vi.fn().mockReturnValue(true),
      } as never,
      customLoadRef: { current: customLoad },
      currentEntityIdRef: { current: 'entity-1' },
      isLoadingRef: { current: false },
      transitionReadyWithPendingSave,
      applyLoadedData: vi.fn(),
      setStatus: vi.fn(),
      setError: vi.fn(),
    }));

    expect(transitionReadyWithPendingSave).toHaveBeenCalledTimes(1);
    expect(customLoad).not.toHaveBeenCalled();
  });

  it('loads custom-mode settings, merges defaults, and applies them when the entity is still current', async () => {
    const applyLoadedData = vi.fn();
    const setStatus = vi.fn();
    const setError = vi.fn();
    const currentEntityIdRef = { current: 'entity-1' };
    const isLoadingRef = { current: false };
    const customLoad = vi.fn().mockResolvedValue({ mode: 'advanced' });

    renderHook(() => useCustomModeLoad({
      isCustomMode: true,
      entityId: 'entity-1',
      enabled: true,
      statusRef: { current: 'idle' },
      defaults: { prompt: 'default', mode: 'basic' },
      debouncedSave: {
        hasPendingFor: vi.fn().mockReturnValue(false),
      } as never,
      customLoadRef: { current: customLoad },
      currentEntityIdRef,
      isLoadingRef,
      transitionReadyWithPendingSave: vi.fn(),
      applyLoadedData,
      setStatus,
      setError,
    }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(setStatus).toHaveBeenCalledWith('loading');
    expect(customLoad).toHaveBeenCalledWith('entity-1');
    expect(applyLoadedData).toHaveBeenCalledWith(
      { prompt: 'default', mode: 'advanced' },
      true,
    );
    expect(isLoadingRef.current).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });

  it('reports custom-mode load failures and transitions into error state', async () => {
    const error = new Error('load failed');
    const setStatus = vi.fn();
    const setError = vi.fn();
    const isLoadingRef = { current: false };

    renderHook(() => useCustomModeLoad({
      isCustomMode: true,
      entityId: 'entity-1',
      enabled: true,
      statusRef: { current: 'idle' },
      defaults: { prompt: 'default' },
      debouncedSave: {
        hasPendingFor: vi.fn().mockReturnValue(false),
      } as never,
      customLoadRef: { current: vi.fn().mockRejectedValue(error) },
      currentEntityIdRef: { current: 'entity-1' },
      isLoadingRef,
      transitionReadyWithPendingSave: vi.fn(),
      applyLoadedData: vi.fn(),
      setStatus,
      setError,
    }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(normalizeAndPresentErrorMock).toHaveBeenCalledWith(error, {
      context: 'useAutoSaveSettings.load',
      showToast: false,
    });
    expect(setStatus).toHaveBeenCalledWith('error');
    expect(setError).toHaveBeenCalledWith(error);
    expect(isLoadingRef.current).toBe(false);
  });

  it('hydrates react-query mode settings and avoids resetting identical snapshots', () => {
    const setSettings = vi.fn();
    const setStatus = vi.fn();
    const setError = vi.fn();
    const loadedSettingsRef = {
      current: { prompt: 'default', mode: 'advanced' },
    };

    const { rerender } = renderHook((dbSettings: { mode: string } | undefined) => useReactQueryModeLoad({
      isCustomMode: false,
      entityId: 'entity-1',
      enabled: true,
      statusRef: { current: 'idle' },
      defaults: { prompt: 'default', mode: 'basic' },
      dbSettings,
      rqIsLoading: false,
      debouncedSave: {
        hasPendingFor: vi.fn().mockReturnValue(false),
      } as never,
      loadedSettingsRef,
      transitionReadyWithPendingSave: vi.fn(),
      setSettings,
      setStatus,
      setError,
    }), {
      initialProps: { mode: 'advanced' },
    });

    expect(setStatus).toHaveBeenCalledWith('ready');
    expect(setSettings).not.toHaveBeenCalled();

    rerender({ mode: 'expert' });

    expect(setSettings).toHaveBeenCalledWith({ prompt: 'default', mode: 'expert' });
    expect(loadedSettingsRef.current).toEqual({ prompt: 'default', mode: 'expert' });
    expect(setError).toHaveBeenCalledWith(null);
  });
});
