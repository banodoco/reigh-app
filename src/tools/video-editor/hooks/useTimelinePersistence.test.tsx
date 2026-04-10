// @vitest-environment jsdom
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimelinePersistence } from './useTimelinePersistence';
import { TimelineEventBus } from './useTimelineEventBus';
import { createInteractionState, notifyInteractionEndIfIdle, type InteractionStateRef } from '../lib/interaction-state';
import { configToRows, type TimelineData } from '../lib/timeline-data';
import { getConfigSignature, getStableConfigSignature } from '../lib/config-utils';
import { createDefaultTimelineConfig } from '../lib/defaults';
import type { DataProvider } from '../data/DataProvider';

function makeTimelineData(label: string): TimelineData {
  const base = createDefaultTimelineConfig();
  const config = {
    ...base,
    output: { ...base.output, file: `output-${label}.mp4` },
    tracks: (base.tracks ?? []).map((track) => ({ ...track })),
    clips: [{
      id: `clip-${label}`,
      at: 0,
      track: 'V1' as const,
      clipType: 'hold' as const,
      hold: 1,
    }],
  };
  const rowData = configToRows(config);
  const resolvedConfig = {
    output: { ...config.output },
    tracks: (config.tracks ?? []).map((track) => ({ ...track })),
    clips: config.clips.map((clip) => ({ ...clip, assetEntry: undefined })),
    registry: {},
  };
  return {
    config,
    configVersion: 1,
    registry: { assets: {} },
    resolvedConfig,
    rows: rowData.rows,
    meta: rowData.meta,
    effects: rowData.effects,
    assetMap: {},
    output: { ...config.output },
    tracks: (config.tracks ?? []).map((track) => ({ ...track })),
    clipOrder: rowData.clipOrder,
    signature: getConfigSignature(resolvedConfig),
    stableSignature: getStableConfigSignature(config, { assets: {} }),
  };
}

interface TestHarness {
  provider: DataProvider;
  saveTimeline: ReturnType<typeof vi.fn>;
  interactionStateRef: InteractionStateRef;
  scheduleSave: (data: TimelineData) => void;
}

function setup(): TestHarness {
  const saveTimeline = vi.fn(async () => 2);
  const provider: DataProvider = {
    loadTimeline: vi.fn(async () => ({ config: createDefaultTimelineConfig(), configVersion: 1 })),
    saveTimeline,
    loadAssetRegistry: vi.fn(async () => ({ assets: {} })),
    resolveAssetUrl: vi.fn((file: string) => file),
  };

  const eventBus = new TimelineEventBus();
  const dataRef = { current: makeTimelineData('initial') };
  const interactionStateRef: InteractionStateRef = { current: createInteractionState() };
  const commitData = vi.fn();
  const selectedClipIdRef = { current: null };
  const selectedTrackIdRef = { current: null };
  const editSeqRef = { current: 1 };
  const savedSeqRef = { current: 0 };
  const configVersionRef = { current: 1 };
  const lastSavedSignatureRef = { current: '' };

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  const hook = renderHook(
    () => useTimelinePersistence({
      provider,
      timelineId: 'timeline-1',
      eventBus,
      dataRef,
      commitData,
      selectedClipIdRef,
      selectedTrackIdRef,
      editSeqRef,
      savedSeqRef,
      configVersionRef,
      lastSavedSignatureRef,
      interactionStateRef,
    }),
    { wrapper },
  );

  return {
    provider,
    saveTimeline,
    interactionStateRef,
    scheduleSave: (data) => {
      act(() => {
        hook.result.current.scheduleSave(data);
      });
    },
  };
}

describe('useTimelinePersistence — interaction gating', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('does NOT fire saveTimeline while a drag interaction is active', async () => {
    const harness = setup();
    harness.interactionStateRef.current.drag = true;

    harness.scheduleSave(makeTimelineData('mid-drag'));

    // Advance well past the 500ms debounce.
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(harness.saveTimeline).not.toHaveBeenCalled();
  });

  it('does NOT fire saveTimeline while a resize interaction is active', async () => {
    const harness = setup();
    harness.interactionStateRef.current.resize = true;

    harness.scheduleSave(makeTimelineData('mid-resize'));

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(harness.saveTimeline).not.toHaveBeenCalled();
  });

  it('flushes the newest deferred payload after the gesture ends', async () => {
    const harness = setup();
    harness.interactionStateRef.current.drag = true;

    // First scheduled mid-drag — should be deferred and replaced.
    harness.scheduleSave(makeTimelineData('drag-1'));
    harness.scheduleSave(makeTimelineData('drag-2'));
    harness.scheduleSave(makeTimelineData('drag-3'));

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(harness.saveTimeline).not.toHaveBeenCalled();

    // End the gesture.
    await act(async () => {
      harness.interactionStateRef.current.drag = false;
      notifyInteractionEndIfIdle(harness.interactionStateRef);
      // Now scheduleSave's setTimeout(500) should fire.
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    expect(harness.saveTimeline).toHaveBeenCalledTimes(1);
    // Should have flushed the newest payload — output.file ends with 'drag-3'.
    const args = harness.saveTimeline.mock.calls[0]?.[1];
    expect(args?.output.file).toBe('output-drag-3.mp4');
  });

  it('keeps save deferred until both drag and resize interactions are idle', async () => {
    const harness = setup();
    harness.interactionStateRef.current.drag = true;
    harness.interactionStateRef.current.resize = true;

    harness.scheduleSave(makeTimelineData('both-active'));

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(harness.saveTimeline).not.toHaveBeenCalled();

    await act(async () => {
      harness.interactionStateRef.current.drag = false;
      notifyInteractionEndIfIdle(harness.interactionStateRef);
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    expect(harness.saveTimeline).not.toHaveBeenCalled();

    await act(async () => {
      harness.interactionStateRef.current.resize = false;
      notifyInteractionEndIfIdle(harness.interactionStateRef);
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    expect(harness.saveTimeline).toHaveBeenCalledTimes(1);
    const args = harness.saveTimeline.mock.calls[0]?.[1];
    expect(args?.output.file).toBe('output-both-active.mp4');
  });

  it('schedules saves normally when no interaction is active', async () => {
    const harness = setup();

    harness.scheduleSave(makeTimelineData('normal'));

    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    expect(harness.saveTimeline).toHaveBeenCalledTimes(1);
  });
});
