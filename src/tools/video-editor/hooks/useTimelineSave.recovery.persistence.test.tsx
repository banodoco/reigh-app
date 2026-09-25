// @vitest-environment jsdom
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeIndexedDB, resetFakeIndexedDB } from 'fake-indexeddb';
import { VideoEditorRuntimeProvider, type VideoEditorRuntimeContextValue } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import type { DataProvider } from '@/tools/video-editor/data/DataProvider.ts';
import { clearTimelineDraft, loadTimelineDraft, saveTimelineDraft } from '@/tools/video-editor/data/timelineDraftIndexedDb.ts';
import { createTimelineStore } from '@/tools/video-editor/hooks/timelineStore.ts';
import { useTimelineSave } from '@/tools/video-editor/hooks/useTimelineSave.ts';
import { createInteractionState } from '@/tools/video-editor/lib/interaction-state.ts';
import { buildTimelineData } from '@/tools/video-editor/lib/timeline-data.ts';
import { createDefaultTimelineConfig } from '@/tools/video-editor/lib/defaults.ts';
import type { TimelineConfig } from '@/tools/video-editor/types/index.ts';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data.ts';

vi.stubGlobal('indexedDB', createFakeIndexedDB());
vi.mock('@/tools/video-editor/compositions/TimelineRenderer.tsx', () => ({
  invalidateReferencedTimelineCache: vi.fn(),
}));
vi.mock('@/tools/video-editor/hooks/usePollSync.ts', () => ({ usePollSync: vi.fn() }));

const timelineId = 'shot-recovery-live-session';
const recoveryKey = 'parent:shot:recovery-integration';
const registry = { assets: {} };

function timelineConfig(label: string): TimelineConfig {
  const base = createDefaultTimelineConfig();
  return {
    ...base,
    output: { ...base.output, file: `${label}.mp4` },
    clips: [{ id: `clip-${label}`, track: 'V1', clipType: 'hold', at: 0, hold: 2 }],
  };
}

async function mountRecoveryEditor(options?: {
  saveTimeline?: DataProvider['saveTimeline'];
  loadCanonicalTimeline?: NonNullable<DataProvider['loadCanonicalTimeline']>;
  initialConfig?: TimelineConfig;
  seedRecovery?: boolean;
}) {
  const canonical = timelineConfig('canonical');
  const recovered = timelineConfig('recovered');
  if (options?.seedRecovery !== false) {
    await saveTimelineDraft('previous-shot-session', { config: recovered, registry }, 5, {
      recoveryKey,
      draftIdentity: 'crashed-retryable-draft',
    });
  }

  let recoveryWriteSequence = 0;
  const provider = {
    persistenceEnabled: true,
    loadTimeline: vi.fn(async () => ({ config: canonical, configVersion: 12 })),
    loadCanonicalTimeline: options?.loadCanonicalTimeline
      ?? vi.fn(async () => ({ config: canonical, configVersion: 12 })),
    loadAssetRegistry: vi.fn(async () => registry),
    saveTimeline: options?.saveTimeline ?? vi.fn(async () => 13),
    resolveAssetUrl: vi.fn(async (file: string) => file),
    getTimelineDraftRecoveryMetadata: () => ({
      recoveryKey,
      draftIdentity: `recovery-write-${++recoveryWriteSequence}`,
    }),
  } as unknown as DataProvider & { saveTimeline: ReturnType<typeof vi.fn> };

  const canonicalData = await buildTimelineData(
    options?.initialConfig ?? canonical,
    registry,
    provider.resolveAssetUrl,
    12,
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const store = createTimelineStore();
  const runtime = { timelineId, assetResolver: null } as unknown as VideoEditorRuntimeContextValue;
  const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(
    QueryClientProvider,
    { client: queryClient },
    React.createElement(VideoEditorRuntimeProvider, { value: runtime }, children),
  );
  const queries = {
    timelineQuery: { isLoading: false, data: undefined },
    assetRegistryQuery: { data: undefined },
  } as never;
  const hook = renderHook(() => useTimelineSave(
    queries,
    provider,
    { current: createInteractionState() },
    store,
  ), { wrapper });
  act(() => {
    hook.result.current.commitData(canonicalData, {
      save: false,
      skipHistory: true,
      updateLastSavedSignature: true,
    });
  });
  if (options?.seedRecovery !== false) {
    await waitFor(() => expect(hook.result.current.recoveryDraft).toMatchObject({ baseVersion: 5 }));
  }
  return { hook, provider, canonical, recovered, canonicalData };
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useTimelineSave recovered Retry/Discard with real persistence', () => {
  beforeEach(async () => {
    resetFakeIndexedDB();
    await clearTimelineDraft(recoveryKey);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('Retry then Discard before debounce cancels the recovered save and a reopened editor remains canonical', async () => {
    const { hook, provider, canonical } = await mountRecoveryEditor();
    vi.useFakeTimers();
    await act(async () => { await hook.result.current.retryRecoveredDraft(); });
    expect(hook.result.current.recoveryDraft).not.toBeNull();
    expect(provider.saveTimeline).not.toHaveBeenCalled();

    await act(async () => { await hook.result.current.discardRecoveredDraft(); });
    await advance(1000);
    expect(provider.saveTimeline).not.toHaveBeenCalled();
    expect(hook.result.current.recoveryDraft).toBeNull();
    expect(hook.result.current.saveStatus).toBe('saved');
    expect(hook.result.current.data?.config.clips).toEqual(canonical.clips);
    expect(await loadTimelineDraft(recoveryKey)).toBeNull();
    hook.unmount();

    vi.useRealTimers();
    const reopened = await mountRecoveryEditor({ seedRecovery: false });
    expect(reopened.hook.result.current.data?.config.clips).toEqual(canonical.clips);
    expect(reopened.hook.result.current.recoveryDraft).toBeNull();
    expect(reopened.provider.saveTimeline).not.toHaveBeenCalled();
    reopened.hook.unmount();
  });

  it('does not commit a Retry that is still building when Discard finishes reloading canonical', async () => {
    const { hook, provider, canonical, recovered } = await mountRecoveryEditor();
    const recoveredData = await buildTimelineData(recovered, registry, provider.resolveAssetUrl, 5);
    let buildStarted!: () => void;
    const buildStartedPromise = new Promise<void>((resolve) => { buildStarted = resolve; });
    let finishBuild!: (data: TimelineData) => void;
    const pendingBuild = new Promise<TimelineData>((resolve) => { finishBuild = resolve; });
    const timelineDataModule = await import('@/tools/video-editor/lib/timeline-data.ts');
    vi.spyOn(timelineDataModule, 'buildTimelineData').mockImplementationOnce(async () => {
      buildStarted();
      return pendingBuild;
    });
    vi.useFakeTimers();

    let retry!: Promise<void>;
    act(() => { retry = hook.result.current.retryRecoveredDraft(); });
    await act(async () => { await buildStartedPromise; });

    await act(async () => { await hook.result.current.discardRecoveredDraft(); });
    expect(hook.result.current.recoveryDraft).toBeNull();
    expect(hook.result.current.data?.config.clips).toEqual(canonical.clips);
    expect(await loadTimelineDraft(recoveryKey)).toBeNull();

    await act(async () => {
      finishBuild(recoveredData);
      await retry;
    });
    await advance(1000);
    expect(provider.saveTimeline).not.toHaveBeenCalled();
    expect(hook.result.current.recoveryDraft).toBeNull();
    expect(hook.result.current.data?.config.clips).toEqual(canonical.clips);
    expect(await loadTimelineDraft(recoveryKey)).toBeNull();
    hook.unmount();
  });

  it('invalidates async Retry when Save as copy uses the persistence hook reload path', async () => {
    const loadCanonicalTimeline = vi.fn(async () => ({ config: timelineConfig('canonical'), configVersion: 14 }));
    const { hook, provider, canonical, recovered } = await mountRecoveryEditor({ loadCanonicalTimeline });
    const recoveredData = await buildTimelineData(recovered, registry, provider.resolveAssetUrl, 5);
    let buildStarted!: () => void;
    const buildStartedPromise = new Promise<void>((resolve) => { buildStarted = resolve; });
    let finishBuild!: (data: TimelineData) => void;
    const pendingBuild = new Promise<TimelineData>((resolve) => { finishBuild = resolve; });
    const timelineDataModule = await import('@/tools/video-editor/lib/timeline-data.ts');
    vi.spyOn(timelineDataModule, 'buildTimelineData').mockImplementationOnce(async () => {
      buildStarted();
      return pendingBuild;
    });
    vi.useFakeTimers();

    let retry!: Promise<void>;
    act(() => { retry = hook.result.current.retryRecoveredDraft(); });
    await act(async () => { await buildStartedPromise; });

    await act(async () => { await hook.result.current.retrySaveAfterConflict(); });
    expect(loadCanonicalTimeline).toHaveBeenCalledTimes(1);
    expect(hook.result.current.data?.config.clips).toEqual(canonical.clips);

    await act(async () => {
      finishBuild(recoveredData);
      await retry;
    });
    await advance(1000);
    expect(provider.saveTimeline).not.toHaveBeenCalled();
    expect(hook.result.current.data?.config.clips).toEqual(canonical.clips);
    hook.unmount();
  });

  it('does not start Retry while canonical Discard is waiting on its reload', async () => {
    let finishCanonicalRead!: (value: { config: TimelineConfig; configVersion: number }) => void;
    const pendingCanonicalRead = new Promise<{ config: TimelineConfig; configVersion: number }>((resolve) => {
      finishCanonicalRead = resolve;
    });
    const loadCanonicalTimeline = vi.fn(() => pendingCanonicalRead);
    const { hook, provider, canonical, recovered } = await mountRecoveryEditor({ loadCanonicalTimeline });
    const recoveredData = await buildTimelineData(recovered, registry, provider.resolveAssetUrl, 5);
    let finishBuild!: (data: TimelineData) => void;
    const pendingBuild = new Promise<TimelineData>((resolve) => { finishBuild = resolve; });
    const timelineDataModule = await import('@/tools/video-editor/lib/timeline-data.ts');
    const realBuildTimelineData = timelineDataModule.buildTimelineData;
    const buildSpy = vi.spyOn(timelineDataModule, 'buildTimelineData').mockImplementation((...args) => (
      args[0].output.file === recovered.output.file
        ? pendingBuild
        : realBuildTimelineData(...args)
    ));

    let discard!: Promise<void>;
    let retry!: Promise<void>;
    let retrySettled = false;
    try {
      act(() => { discard = hook.result.current.discardRecoveredDraft(); });
      await waitFor(() => expect(loadCanonicalTimeline).toHaveBeenCalledTimes(1));

      act(() => {
        retry = hook.result.current.retryRecoveredDraft();
        void retry.then(() => { retrySettled = true; });
      });
      await waitFor(() => expect(retrySettled).toBe(true), { timeout: 500 });
      expect(buildSpy.mock.calls.some(([config]) => config.output.file === recovered.output.file)).toBe(false);

      finishCanonicalRead({ config: canonical, configVersion: 14 });
      await act(async () => { await discard; });
      expect(hook.result.current.recoveryDraft).toBeNull();
      expect(hook.result.current.data?.config.clips).toEqual(canonical.clips);
      expect(provider.saveTimeline).not.toHaveBeenCalled();
      expect(await loadTimelineDraft(recoveryKey)).toBeNull();
    } finally {
      // If an assertion fails on the unguarded path, release both held async
      // operations so the hook can settle cleanly for the next test.
      finishBuild(recoveredData);
      finishCanonicalRead({ config: canonical, configVersion: 14 });
      if (retry) await act(async () => { await retry; });
      if (discard) await act(async () => { await discard; });
      hook.unmount();
    }
  });

  it('waits for Retry already in flight, then reads canonical without publishing again afterward', async () => {
    let acknowledge: ((version: number) => void) | null = null;
    const events: string[] = [];
    const saveTimeline = vi.fn(() => {
      events.push('save-start');
      return new Promise<number>((resolve) => { acknowledge = resolve; });
    });
    const loadCanonicalTimeline = vi.fn(async () => {
      events.push('canonical-read');
      return { config: timelineConfig('canonical'), configVersion: 14 };
    });
    const { hook, provider, canonical } = await mountRecoveryEditor({ saveTimeline, loadCanonicalTimeline });
    vi.useFakeTimers();
    await act(async () => { await hook.result.current.retryRecoveredDraft(); });
    await advance(600);
    expect(saveTimeline).toHaveBeenCalledTimes(1);

    let discard!: Promise<void>;
    act(() => { discard = hook.result.current.discardRecoveredDraft(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(events).toEqual(['save-start']);
    expect(loadCanonicalTimeline).not.toHaveBeenCalled();

    await act(async () => { acknowledge?.(13); });
    await act(async () => { await discard; });
    expect(events).toEqual(['save-start', 'canonical-read']);
    expect(loadCanonicalTimeline).toHaveBeenCalledTimes(1);
    expect(saveTimeline).toHaveBeenCalledTimes(1);
    expect(hook.result.current.recoveryDraft).toBeNull();
    expect(hook.result.current.data?.config.clips).toEqual(canonical.clips);
    expect(await loadTimelineDraft(recoveryKey)).toBeNull();

    await advance(1000);
    expect(saveTimeline).toHaveBeenCalledTimes(1);
    hook.unmount();
  });
});
