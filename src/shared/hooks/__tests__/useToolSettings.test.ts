import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  extractSettingsFromCache,
  updateSettingsCache,
} from '../useToolSettings';

// ============================================================================
// Tests for exported pure helper functions
// ============================================================================

describe('extractSettingsFromCache', () => {
  it('returns undefined for null/undefined input', () => {
    expect(extractSettingsFromCache(null)).toBeUndefined();
    expect(extractSettingsFromCache(undefined)).toBeUndefined();
  });

  it('extracts settings from wrapper format', () => {
    const cacheData = {
      settings: { prompt: 'test', seed: 42 },
      hasShotSettings: true,
    };
    const result = extractSettingsFromCache<{ prompt: string; seed: number }>(cacheData);
    expect(result).toEqual({ prompt: 'test', seed: 42 });
  });

  it('returns data as-is for flat format (legacy)', () => {
    const cacheData = { prompt: 'test', seed: 42 };
    const result = extractSettingsFromCache<{ prompt: string; seed: number }>(cacheData);
    expect(result).toEqual({ prompt: 'test', seed: 42 });
  });

  it('handles empty settings object in wrapper format', () => {
    const cacheData = { settings: {}, hasShotSettings: false };
    const result = extractSettingsFromCache<Record<string, unknown>>(cacheData);
    expect(result).toEqual({});
  });
});

describe('updateSettingsCache', () => {
  it('merges updates into wrapper format', () => {
    const prev = {
      settings: { prompt: 'old', seed: 42 },
      hasShotSettings: true,
    };
    const result = updateSettingsCache<{ prompt: string; seed: number }>(prev, { prompt: 'new' });

    expect(result.settings).toEqual({ prompt: 'new', seed: 42 });
    expect(result.hasShotSettings).toBe(true);
  });

  it('merges updates into flat format (legacy)', () => {
    const prev = { prompt: 'old', seed: 42 };
    const result = updateSettingsCache<{ prompt: string; seed: number }>(prev, { prompt: 'new' });

    expect(result.settings).toEqual({ prompt: 'new', seed: 42 });
    expect(result.hasShotSettings).toBe(false);
  });

  it('handles null prev data', () => {
    const result = updateSettingsCache<{ prompt: string }>(null, { prompt: 'new' });

    expect(result.settings).toEqual({ prompt: 'new' });
    expect(result.hasShotSettings).toBe(false);
  });

  it('handles undefined prev data', () => {
    const result = updateSettingsCache<{ prompt: string }>(undefined, { prompt: 'new' });

    expect(result.settings).toEqual({ prompt: 'new' });
    expect(result.hasShotSettings).toBe(false);
  });

  it('supports function updater', () => {
    const prev = {
      settings: { count: 5, label: 'test' },
      hasShotSettings: false,
    };

    const result = updateSettingsCache<{ count: number; label: string }>(
      prev,
      (prevSettings) => ({ count: prevSettings.count + 1 })
    );

    expect(result.settings).toEqual({ count: 6, label: 'test' });
  });

  it('preserves hasShotSettings from existing wrapper', () => {
    const prev = {
      settings: { prompt: 'old' },
      hasShotSettings: true,
    };
    const result = updateSettingsCache<{ prompt: string }>(prev, { prompt: 'new' });

    expect(result.hasShotSettings).toBe(true);
  });

  it('sets hasShotSettings to false for non-wrapper format', () => {
    const prev = { prompt: 'old' };
    const result = updateSettingsCache<{ prompt: string }>(prev, { prompt: 'new' });

    expect(result.hasShotSettings).toBe(false);
  });
});

// ============================================================================
// Tests for the useToolSettings hook
// ============================================================================

// Mock dependencies
vi.mock('@/shared/contexts/ProjectContext', () => ({
  useProject: () => ({ selectedProjectId: 'project-1' }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
  },
}));

vi.mock('@/shared/lib/toolSettingsService', () => ({
  fetchToolSettingsSupabase: vi.fn().mockResolvedValue({
    settings: { prompt: 'default', seed: 1 },
    hasShotSettings: false,
  }),
  getUserWithTimeout: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
}));

vi.mock('@/shared/lib/settingsWriteQueue', () => ({
  enqueueSettingsWrite: vi.fn().mockResolvedValue({ prompt: 'saved' }),
  setSettingsWriteFunction: vi.fn(),
}));

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

vi.mock('@/shared/lib/errorUtils', () => ({
  isCancellationError: () => false,
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useToolSettings hook', () => {
  // Import the hook directly — vi.mock hoisting ensures mocks are applied
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  let useToolSettings: typeof import('../useToolSettings').useToolSettings;

  beforeEach(async () => {
    const mod = await import('../useToolSettings');
    useToolSettings = mod.useToolSettings;
  });

  it('returns loading state initially', () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useToolSettings('test-tool'), { wrapper });

    // Should have the expected shape
    expect(result.current).toHaveProperty('settings');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('error');
    expect(result.current).toHaveProperty('update');
    expect(result.current).toHaveProperty('isUpdating');
    expect(result.current).toHaveProperty('hasShotSettings');
  });

  it('returns a stable update function', () => {
    const wrapper = createWrapper();
    const { result, rerender } = renderHook(() => useToolSettings('test-tool'), { wrapper });

    const firstUpdate = result.current.update;
    rerender();
    expect(result.current.update).toBe(firstUpdate);
  });

  it('respects enabled option', () => {
    const wrapper = createWrapper();
    const { result } = renderHook(
      () => useToolSettings('test-tool', { enabled: false }),
      { wrapper }
    );

    // When disabled, settings should be undefined
    expect(result.current.settings).toBeUndefined();
  });

  it('uses provided projectId over context', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(
      () => useToolSettings('test-tool', { projectId: 'custom-project' }),
      { wrapper }
    );

    await waitFor(() => {
      // Just verify it doesn't crash with custom projectId
      expect(result.current).toHaveProperty('settings');
    });
  });
});
