// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTimelineSync } from './useTimelineSync.ts';

describe('useTimelineSync', () => {
  it('routes click and drag intent through the preview seek API while mirroring time', () => {
    const seek = vi.fn();
    const setCurrentTime = vi.fn();
    const timelineRef = { current: { setTime: vi.fn() } };
    const previewRef = { current: { seek } };
    const isSyncingFromPreview = { current: false };
    const isSyncingFromTimeline = { current: false };
    const { result } = renderHook(() => useTimelineSync({
      timelineRef,
      previewRef,
      setCurrentTime,
      isSyncingFromPreview,
      isSyncingFromTimeline,
    }));

    act(() => {
      result.current.onCursorDrag(1.25);
      result.current.onClickTimeArea(2.5);
    });

    expect(seek).toHaveBeenNthCalledWith(1, 1.25);
    expect(seek).toHaveBeenNthCalledWith(2, 2.5);
    expect(setCurrentTime).toHaveBeenNthCalledWith(1, 1.25);
    expect(setCurrentTime).toHaveBeenNthCalledWith(2, 2.5);
  });
});
