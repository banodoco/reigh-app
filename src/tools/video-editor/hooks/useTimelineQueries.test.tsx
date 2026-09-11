// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_TIMELINE_REFRESH_INTERVAL_MS,
  getTimelineRefreshInterval,
  getTimelineRefreshOptions,
  useTimelineQueries,
} from '@/tools/video-editor/hooks/useTimelineQueries.ts';
import { createDefaultTimelineConfig } from '@/tools/video-editor/lib/defaults.ts';
import type { DataProvider } from '@/tools/video-editor/data/DataProvider.ts';

/**
 * The source half of the load-error surfacing chain: a provider that rejects
 * must leave `timelineQuery.error` populated (nothing else in the shell can
 * observe the failure — `isLoading` goes false and no render throws). The sink
 * half — the shell rendering that error as a card instead of an empty editor —
 * is pinned in `TimelineEditorShellCore.test.tsx`.
 */
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const makeProvider = (loadTimeline: DataProvider['loadTimeline']): DataProvider => ({
  persistenceEnabled: true,
  loadTimeline,
  loadAssetRegistry: async () => ({ assets: {} }),
  saveTimeline: async () => 1,
  resolveAssetUrl: async (file: string) => file,
} as unknown as DataProvider);

describe('useTimelineQueries', () => {
  it('uses bounded Runtime polling and explicit reconnect refetch on the canonical read seam', () => {
    const runtimeProvider = makeProvider(async () => ({
      config: {},
      configVersion: 1,
    } as never));
    (runtimeProvider as DataProvider & { refreshIntervalMs: number }).refreshIntervalMs = 2_000;

    expect(getTimelineRefreshInterval(runtimeProvider)).toBe(2_000);
    expect(getTimelineRefreshOptions(runtimeProvider)).toEqual({
      refetchInterval: 2_000,
      refetchOnReconnect: true,
    });
    expect(getTimelineRefreshInterval(makeProvider(async () => ({}) as never)))
      .toBe(DEFAULT_TIMELINE_REFRESH_INTERVAL_MS);
  });

  it('refetches the canonical timeline read after reconnect', async () => {
    onlineManager.setOnline(true);
    const loadTimeline = vi.fn()
      .mockResolvedValueOnce({ config: createDefaultTimelineConfig(), configVersion: 1 } as never)
      .mockResolvedValueOnce({ config: createDefaultTimelineConfig(), configVersion: 2 } as never);
    const provider = makeProvider(loadTimeline);

    const { result } = renderHook(
      () => useTimelineQueries(provider, 'timeline-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(loadTimeline).toHaveBeenCalledTimes(1));
    await act(async () => {
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });

    await waitFor(() => {
      expect(loadTimeline).toHaveBeenCalledTimes(2);
      expect(result.current.timelineQuery.data?.configVersion).toBe(2);
    });
  });

  it('surfaces a rejected loadTimeline as timelineQuery.error', async () => {
    const failure = new Error('Astrid bridge returned a malformed timeline payload: config: expected object, received string');
    const provider = makeProvider(async () => { throw failure; });

    const { result } = renderHook(
      () => useTimelineQueries(provider, 'timeline-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.timelineQuery.error).toBe(failure);
    });
    expect(result.current.timelineQuery.isLoading).toBe(false);
    expect(result.current.timelineQuery.data).toBeUndefined();
  });
});
