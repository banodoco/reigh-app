// @vitest-environment jsdom
//
// Regression tests for the shot-boundary playback blink fix.
//
// Previously ShotClipSequence cleared `childConfig` and asynchronously
// reloaded the referenced timeline on EVERY mount, so crossing a shot
// boundary during playback flashed the dark "Loading shot…" placeholder.
// The fix caches resolved child configs per (provider, timelineId) with:
//   - promise dedup for repeated/concurrent loads
//   - synchronous cache reuse on remount (useSyncExternalStore first-render)
//   - explicit invalidation after a child save
//   - premounting so the next shot is mounted before the boundary

import type { FC, PropsWithChildren } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TimelineRenderer,
  invalidateReferencedTimelineCache,
} from '@/tools/video-editor/compositions/TimelineRenderer';
import type { DataProvider, LoadedReferencedTimeline } from '@/tools/video-editor/data/DataProvider.ts';
import {
  VideoEditorRuntimeContext,
  type VideoEditorRuntimeContextValue,
} from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import type { ResolvedTimelineConfig } from '@/tools/video-editor/types';

vi.mock('remotion', async () => {
  return {
    AbsoluteFill: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => (
      <div data-testid="absolute-fill" {...props}>{children}</div>
    ),
    Sequence: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => (
      <div data-testid="sequence" data-premount-for={props.premountFor}>{children}</div>
    ),
    useCurrentFrame: () => 0,
    useRemotionEnvironment: () => ({ isRendering: false, isClientSideRendering: false }),
  };
});

// The child timeline's clips render through VisualClipSequence; replace it
// with a marker so tests can assert the cached child config actually mounts.
vi.mock('@/tools/video-editor/compositions/VisualClip.tsx', () => ({
  VisualClipSequence: () => <div data-testid="child-shot-content">child-shot-content</div>,
}));

vi.mock('@/tools/video-editor/compositions/AudioAnalysisProvider', () => ({
  AudioAnalysisProvider: ({ children }: PropsWithChildren) => <>{children}</>,
}));

const CHILD_MARKER = 'child-shot-content';

const childConfig = (): ResolvedTimelineConfig => ({
  output: { resolution: '1920x1080', fps: 30, file: 'child.mp4' },
  tracks: [{ id: 'V1', kind: 'visual', label: 'V1' }],
  clips: [
    { id: 'child-clip-1', clipType: 'hold', track: 'V1', at: 0, hold: 1, params: {} },
  ],
  registry: {},
});

const parentConfig = (timelineDocumentId: string, clipId = 'shot-1'): ResolvedTimelineConfig => ({
  output: { resolution: '1920x1080', fps: 30, file: 'parent.mp4' },
  tracks: [{ id: 'V1', kind: 'visual', label: 'V1' }],
  clips: [
    {
      id: clipId,
      clipType: 'shot',
      track: 'V1',
      at: 0,
      hold: 2,
      params: { timeline_document_id: timelineDocumentId },
    },
  ],
  registry: {},
});

type Deferred = {
  promise: Promise<LoadedReferencedTimeline>;
  resolve: (value: LoadedReferencedTimeline) => void;
};

const makeDeferred = (): Deferred => {
  let resolve!: Deferred['resolve'];
  const promise = new Promise<LoadedReferencedTimeline>((res) => { resolve = res; });
  return { promise, resolve };
};

const makeProvider = (options: { load: (timelineId: string) => Promise<LoadedReferencedTimeline> }) => {
  const loadSpy = vi.fn(options.load);
  const provider = { loadReferencedTimeline: loadSpy } as unknown as DataProvider;
  return { provider, loadSpy };
};

const loadedChild = (): LoadedReferencedTimeline => ({
  timeline: { config: childConfig() as never, configVersion: 1 },
  registry: { assets: {} } as never,
  resolveAssetUrl: async (file: string) => file,
});

const renderShot = (provider: DataProvider, timelineId = 'child-timeline') => {
  const contextValue = { provider } as unknown as VideoEditorRuntimeContextValue;
  return render(
    <VideoEditorRuntimeContext.Provider value={contextValue}>
      <TimelineRenderer config={parentConfig(timelineId)} />
    </VideoEditorRuntimeContext.Provider>,
  );
};

describe('ShotClipSequence referenced-timeline cache', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('deduplicates repeated sequential mounts: one load, second mount synchronous', async () => {
    const deferred = makeDeferred();
    const { provider, loadSpy } = makeProvider({ load: () => deferred.promise });

    const first = renderShot(provider);
    expect(loadSpy).toHaveBeenCalledTimes(1);

    // Resolve the first load.
    await act(async () => {
      deferred.resolve(loadedChild());
    });
    await waitFor(() => {
      expect(screen.getByText(CHILD_MARKER)).toBeTruthy();
    });
    first.unmount();

    // Remount with the SAME provider: served from cache, no second load.
    const second = renderShot(provider);
    expect(loadSpy).toHaveBeenCalledTimes(1);
    // Synchronous reuse: the child content is present immediately, without
    // a loading placeholder frame.
    expect(screen.getByText(CHILD_MARKER)).toBeTruthy();
    expect(screen.queryByTestId('shot-preview-loading')).toBeNull();
    second.unmount();
  });

  it('deduplicates concurrent mounts sharing one in-flight load', async () => {
    const deferred = makeDeferred();
    const { provider, loadSpy } = makeProvider({ load: () => deferred.promise });

    const a = renderShot(provider, 'shared-child');
    const b = renderShot(provider, 'shared-child');

    expect(loadSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve(loadedChild());
    });
    await waitFor(() => {
      expect(screen.getAllByText(CHILD_MARKER)).toHaveLength(2);
    });
    a.unmount();
    b.unmount();
  });

  it('no loading placeholder when crossing a primed shot boundary (cached config reused synchronously)', async () => {
    const deferred = makeDeferred();
    const { provider, loadSpy } = makeProvider({ load: () => deferred.promise });

    // Prime: mount once and let the load settle.
    const priming = renderShot(provider);
    await act(async () => {
      deferred.resolve(loadedChild());
    });
    await waitFor(() => {
      expect(screen.getByText(CHILD_MARKER)).toBeTruthy();
    });
    priming.unmount();

    // Remount (simulates the playhead crossing back into a primed shot):
    // the cached child config must be reused on the FIRST render — the
    // loading placeholder must never appear.
    const remounted = renderShot(provider);
    expect(screen.queryByTestId('shot-preview-loading')).toBeNull();
    expect(screen.getByText(CHILD_MARKER)).toBeTruthy();
    expect(loadSpy).toHaveBeenCalledTimes(1);
    remounted.unmount();
  });

  it('sequences premount so the next shot mounts before the boundary', async () => {
    const deferred = makeDeferred();
    const { provider } = makeProvider({ load: () => deferred.promise });

    renderShot(provider);
    await act(async () => {
      deferred.resolve(loadedChild());
    });
    await waitFor(() => {
      expect(screen.getByText(CHILD_MARKER)).toBeTruthy();
    });

    const sequence = screen.getByTestId('sequence');
    expect(sequence.getAttribute('data-premount-for')).toBe('60'); // fps 30 * 2
  });

  it('invalidates a specific timeline after a save so the next mount reloads fresh data', async () => {
    let loadCount = 0;
    const deferred = makeDeferred();
    const { provider, loadSpy } = makeProvider({
      load: () => {
        loadCount += 1;
        return deferred.promise;
      },
    });

    const mounted = renderShot(provider);
    await act(async () => {
      deferred.resolve(loadedChild());
    });
    await waitFor(() => {
      expect(screen.getByText(CHILD_MARKER)).toBeTruthy();
    });
    expect(loadSpy).toHaveBeenCalledTimes(1);

    act(() => {
      invalidateReferencedTimelineCache(provider, 'child-timeline');
    });

    // After invalidation the same mounted component re-kicks the load.
    await waitFor(() => {
      expect(loadSpy).toHaveBeenCalledTimes(2);
    });

    // And a later remount shares the fresh in-flight load rather than stale
    // data or a third duplicate request.
    mounted.unmount();
    const fresh = renderShot(provider);
    await waitFor(() => {
      expect(loadSpy).toHaveBeenCalledTimes(2);
    });
    expect(loadCount).toBe(2);
    fresh.unmount();
  });

  it('a failed load falls back to the placeholder and retries on a later mount', async () => {
    const { provider, loadSpy } = makeProvider({
      load: () => Promise.reject(new Error('child missing')),
    });

    const first = renderShot(provider);
    await waitFor(() => {
      expect(screen.getByTestId('shot-preview-loading')).toBeTruthy();
    });
    first.unmount();

    // The failed entry was dropped: a remount retries the load.
    const second = renderShot(provider);
    expect(loadSpy).toHaveBeenCalledTimes(2);
    second.unmount();
  });
});
