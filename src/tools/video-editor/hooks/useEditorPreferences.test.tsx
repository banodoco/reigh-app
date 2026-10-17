// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPreferences, useEditorPreferences } from './useEditorPreferences';

describe('useEditorPreferences right panel state', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
      clear: () => values.clear(),
    };
    vi.stubGlobal('localStorage', storage);
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('migrates older timeline records and persists panel, slot, and lane choices', () => {
    localStorage.setItem('video-editor:preferences:legacy', JSON.stringify({
      scaleWidth: 190,
      activeClipTab: 'timing',
      assetPanel: { showAll: true, showHidden: false, hidden: [] },
    }));

    const { result } = renderHook(() => useEditorPreferences('legacy'));
    expect(result.current.preferences.selectedRightPanelId).toBe('host:properties');
    expect(result.current.preferences.rightPanelLayoutSlotsByPanelId).toEqual({});
    expect(result.current.preferences.showDataLanes).toBe(false);
    expect(result.current.preferences.showTranscriptLane).toBe(true);

    act(() => {
      result.current.setSelectedRightPanelId('haus.astrid.transcript-lane:transcript-lane-panel');
      result.current.setRightPanelLayoutSlot('haus.astrid.transcript-lane:transcript-lane-panel', 'compact');
      result.current.setShowDataLanes(true);
    });
    act(() => vi.advanceTimersByTime(250));

    const saved = JSON.parse(localStorage.getItem('video-editor:preferences:legacy') ?? '{}');
    expect(saved.selectedRightPanelId).toBe('haus.astrid.transcript-lane:transcript-lane-panel');
    expect(saved.rightPanelLayoutSlotsByPanelId).toEqual({
      'haus.astrid.transcript-lane:transcript-lane-panel': 'compact',
    });
    expect(saved.showDataLanes).toBe(true);
    expect(saved.scaleWidth).toBe(190);
  });

  it('keeps two timeline hosts isolated and persists an explicit closed panel', () => {
    const first = renderHook(() => useEditorPreferences('first'));
    const second = renderHook(() => useEditorPreferences('second'));

    act(() => {
      first.result.current.setSelectedRightPanelId(null);
      first.result.current.setRightPanelLayoutSlot('haus.astrid.transcript-lane:transcript-lane-panel', 'compact');
      first.result.current.setShowDataLanes(true);
    });

    expect(first.result.current.preferences.selectedRightPanelId).toBeNull();
    expect(second.result.current.preferences.selectedRightPanelId).toBe('host:properties');
    expect(second.result.current.preferences.showDataLanes).toBe(false);
    expect(second.result.current.preferences.rightPanelLayoutSlotsByPanelId).toEqual({});
  });
  it('defaults an absent transcript lane preference on, preserves explicit off and keeps it independent', () => {
    localStorage.setItem('video-editor:preferences:migration', JSON.stringify({ ...defaultPreferences, showTranscriptLane: undefined, showDataLanes: false, selectedRightPanelId: null, rightPanelTab: undefined }));
    const { result } = renderHook(() => useEditorPreferences('migration'));
    expect(result.current.preferences.selectedRightPanelId).toBeNull();
    expect(result.current.preferences.showTranscriptLane).toBe(true);
    act(() => result.current.setShowTranscriptLane(false));
    expect(result.current.preferences.showDataLanes).toBe(false);
    expect(result.current.preferences.showTranscriptLane).toBe(false);
    act(() => result.current.setShowTranscriptLane(true));
    act(() => { result.current.setSelectedRightPanelId('astrid:transcript'); result.current.setRightPanelLayoutSlot('astrid:transcript', 'compact'); });
    act(() => result.current.setSelectedRightPanelId('host:properties'));
    act(() => result.current.setSelectedRightPanelId(null));
    expect(result.current.preferences.lastExtensionPanelId).toBe('astrid:transcript');
    expect(result.current.preferences.rightPanelTab).toBe('inspector');
    expect(result.current.preferences.rightPanelLayoutSlotsByPanelId['astrid:transcript']).toBe('compact');
    act(() => result.current.setShowTranscriptLane(false));
    expect(result.current.preferences.showDataLanes).toBe(false);
    expect(result.current.preferences.showTranscriptLane).toBe(false);
  });

  it('migrates legacy transcript visibility into per-kind visibility and supports new kinds', () => {
    localStorage.setItem('video-editor:preferences:per-kind', JSON.stringify({ ...defaultPreferences,
      showTranscriptLane: false, showDataLanes: true }));
    const { result } = renderHook(() => useEditorPreferences('per-kind'));
    expect(result.current.preferences.showDataLanesByKind?.['astrid.transcript']).toBe(false);
    act(() => result.current.setDataKindLaneVisible('astrid.marker', false));
    expect(result.current.preferences.showDataLanesByKind?.['astrid.marker']).toBe(false);
    expect(result.current.preferences.showDataLanesByKind?.['astrid.transcript']).toBe(false);
  });

});
