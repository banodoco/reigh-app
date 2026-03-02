import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useHandleDrag } from './useHandleDrag';
import type { PortionSelection } from '../types';

function createRect(left: number, width: number): DOMRect {
  return {
    left,
    width,
    top: 0,
    right: left + width,
    bottom: 10,
    height: 10,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function createVideoMock(initialPaused: boolean) {
  const video = document.createElement('video');
  let paused = initialPaused;

  Object.defineProperty(video, 'paused', {
    get: () => paused,
    configurable: true,
  });
  Object.defineProperty(video, 'currentTime', {
    value: 0,
    writable: true,
    configurable: true,
  });

  const pause = vi.fn(() => {
    paused = true;
  });
  const play = vi.fn(() => {
    paused = false;
    return Promise.resolve();
  });

  Object.defineProperty(video, 'pause', { value: pause, configurable: true });
  Object.defineProperty(video, 'play', { value: play, configurable: true });

  return { video, pause, play };
}

function createTrackRef(width = 100, left = 0): React.RefObject<HTMLDivElement | null> {
  const track = document.createElement('div');
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue(createRect(left, width));
  return { current: track };
}

function setupHook(options: {
  selections?: PortionSelection[];
  duration?: number;
  fps?: number | null;
  maxGapFrames?: number;
  initialPaused?: boolean;
} = {}) {
  const selections: PortionSelection[] = options.selections ?? [{ id: 'sel-1', start: 2, end: 5 }];
  const onSelectionChange = vi.fn();
  const onSelectionClick = vi.fn();
  const { video, pause, play } = createVideoMock(options.initialPaused ?? false);
  const videoRef = { current: video } as React.RefObject<HTMLVideoElement | null>;
  const trackRef = createTrackRef();

  const hook = renderHook(() =>
    useHandleDrag({
      duration: options.duration ?? 10,
      selections,
      fps: options.fps ?? 10,
      maxGapFrames: options.maxGapFrames ?? 20,
      videoRef,
      trackRef,
      onSelectionChange,
      onSelectionClick,
    }),
  );

  return {
    ...hook,
    video,
    pause,
    play,
    onSelectionChange,
    onSelectionClick,
  };
}

describe('useHandleDrag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts dragging by pausing video, selecting handle, and seeking to the handle time', () => {
    const { result, pause, onSelectionClick, video } = setupHook();
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.startDrag(event, 'sel-1', 'start');
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(result.current.dragging).toEqual({ id: 'sel-1', handle: 'start' });
    expect(result.current.selectedHandle).toEqual({ id: 'sel-1', handle: 'start' });
    expect(onSelectionClick).toHaveBeenCalledWith('sel-1');
    expect(video.currentTime).toBe(2);
  });

  it('supports tap-to-select and tap-to-move with min-gap clamping', () => {
    const { result, onSelectionChange, onSelectionClick, video } = setupHook({ fps: 10, duration: 10 });

    act(() => {
      result.current.handleHandleTap({} as React.MouseEvent, 'sel-1', 'start');
    });

    expect(result.current.selectedHandle).toEqual({ id: 'sel-1', handle: 'start' });
    expect(onSelectionClick).toHaveBeenCalledWith('sel-1');
    expect(video.currentTime).toBe(2);

    act(() => {
      result.current.handleTrackTap({ clientX: 95 } as React.MouseEvent);
    });

    expect(onSelectionChange).toHaveBeenCalledWith('sel-1', 4.8, 5);
    expect(video.currentTime).toBe(4.8);
    expect(result.current.selectedHandle).toBeNull();
  });

  it('updates drag position through window listeners, flags max-gap exceedance, and resumes playback on end', () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    const { result, onSelectionChange, play, video } = setupHook({ maxGapFrames: 20, initialPaused: false });

    act(() => {
      result.current.startDrag(
        {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 20,
        } as unknown as React.MouseEvent,
        'sel-1',
        'start',
      );
    });

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 0 }));
    });

    expect(result.current.isDragExceedingMax).toBe(true);
    expect(result.current.dragOffsetRef.current).toEqual({ id: 'sel-1', handle: 'start', offsetPx: -20 });
    expect(video.currentTime).toBe(0);
    expect(onSelectionChange).toHaveBeenCalledWith('sel-1', 0, 5);
    expect(rafSpy).toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });

    expect(result.current.dragging).toBeNull();
    expect(result.current.dragOffsetRef.current).toBeNull();
    expect(result.current.isDragExceedingMax).toBe(false);
    expect(play).toHaveBeenCalledTimes(1);
  });
});
