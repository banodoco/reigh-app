import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePlayhead } from './usePlayhead';

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

function createScrubberMock() {
  const scrubber = document.createElement('div');
  vi.spyOn(scrubber, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    width: 200,
    top: 0,
    right: 200,
    bottom: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return scrubber;
}

describe('usePlayhead', () => {
  it('tracks video timeupdate when not dragging', () => {
    const { video } = createVideoMock(true);
    const scrubber = createScrubberMock();

    const { result } = renderHook(() =>
      usePlayhead({
        duration: 20,
        videoRef: { current: video } as React.RefObject<HTMLVideoElement | null>,
        scrubberRef: { current: scrubber } as React.RefObject<HTMLDivElement | null>,
      }),
    );

    act(() => {
      video.currentTime = 7.5;
      video.dispatchEvent(new Event('timeupdate'));
    });

    expect(result.current.currentTime).toBe(7.5);
  });

  it('seeks via scrubber interaction for mouse and touch inputs', () => {
    const { video } = createVideoMock(true);
    const scrubber = createScrubberMock();
    const { result } = renderHook(() =>
      usePlayhead({
        duration: 10,
        videoRef: { current: video } as React.RefObject<HTMLVideoElement | null>,
        scrubberRef: { current: scrubber } as React.RefObject<HTMLDivElement | null>,
      }),
    );

    act(() => {
      result.current.handleScrubberInteraction({ clientX: 100 } as MouseEvent);
    });
    expect(video.currentTime).toBe(5);
    expect(result.current.currentTime).toBe(5);

    act(() => {
      result.current.handleScrubberInteraction({
        touches: [{ clientX: 50 }],
      } as unknown as TouchEvent);
    });
    expect(video.currentTime).toBe(2.5);
  });

  it('pauses on drag start and resumes playback on drag end when previously playing', () => {
    const { video, pause, play } = createVideoMock(false);
    const scrubber = createScrubberMock();
    const { result } = renderHook(() =>
      usePlayhead({
        duration: 8,
        videoRef: { current: video } as React.RefObject<HTMLVideoElement | null>,
        scrubberRef: { current: scrubber } as React.RefObject<HTMLDivElement | null>,
      }),
    );

    act(() => {
      result.current.startPlayheadDrag({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 80,
      } as unknown as React.MouseEvent);
    });

    expect(pause).toHaveBeenCalledTimes(1);
    expect(result.current.isDraggingPlayhead).toBe(true);

    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });

    expect(result.current.isDraggingPlayhead).toBe(false);
    expect(play).toHaveBeenCalledTimes(1);
  });
});
