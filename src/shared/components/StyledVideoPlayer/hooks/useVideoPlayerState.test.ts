// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVideoPlayerState } from './useVideoPlayerState';

const { mockNormalizeAndPresentError } = vi.hoisted(() => ({
  mockNormalizeAndPresentError: vi.fn(),
}));

vi.mock('../../../lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: mockNormalizeAndPresentError,
}));

function createVideoRef() {
  const video = document.createElement('video');
  Object.defineProperty(video, 'muted', {
    configurable: true,
    writable: true,
    value: false,
  });
  Object.defineProperty(video, 'paused', {
    configurable: true,
    writable: true,
    value: true,
  });
  Object.defineProperty(video, 'duration', {
    configurable: true,
    writable: true,
    value: 0,
  });
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    writable: true,
    value: 0,
  });
  Object.defineProperty(video, 'readyState', {
    configurable: true,
    writable: true,
    value: 4,
  });
  Object.defineProperty(video, 'networkState', {
    configurable: true,
    writable: true,
    value: 2,
  });
  Object.defineProperty(video, 'error', {
    configurable: true,
    writable: true,
    value: null,
  });
  return { current: video } as React.RefObject<HTMLVideoElement>;
}

describe('useVideoPlayerState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('syncs muted state, readiness, and playback constraints from media events', () => {
    const videoRef = createVideoRef();
    const { result } = renderHook(() =>
      useVideoPlayerState({
        videoRef,
        src: 'video.mp4',
        muted: true,
        playbackStart: 2,
        playbackEnd: 10,
      }),
    );

    expect(videoRef.current?.muted).toBe(true);
    expect(result.current.isMuted).toBe(true);

    act(() => {
      if (videoRef.current) {
        Object.defineProperty(videoRef.current, 'duration', {
          configurable: true,
          writable: true,
          value: 20,
        });
        videoRef.current.dispatchEvent(new Event('loadedmetadata'));
        videoRef.current.dispatchEvent(new Event('canplay'));
      }
    });

    expect(result.current.duration).toBe(20);
    expect(result.current.isVideoReady).toBe(true);
    expect(videoRef.current?.currentTime).toBe(2);

    if (videoRef.current) {
      Object.defineProperty(videoRef.current, 'paused', {
        configurable: true,
        writable: true,
        value: false,
      });
      Object.defineProperty(videoRef.current, 'currentTime', {
        configurable: true,
        writable: true,
        value: 10,
      });
      videoRef.current.dispatchEvent(new Event('timeupdate'));
    }

    expect(videoRef.current?.currentTime).toBe(2);
  });

  it('shows controls while hovering and hides them after the hover timeout', () => {
    const videoRef = createVideoRef();
    const { result } = renderHook(() =>
      useVideoPlayerState({
        videoRef,
        src: 'video.mp4',
        muted: false,
      }),
    );

    act(() => {
      result.current.setIsHovering(true);
    });
    expect(result.current.showControls).toBe(true);

    act(() => {
      result.current.setIsHovering(false);
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.showControls).toBe(false);
  });

  it('reports media errors with runtime context', () => {
    const videoRef = createVideoRef();
    const { result } = renderHook(() =>
      useVideoPlayerState({
        videoRef,
        src: 'https://cdn.example.com/video.mp4',
        muted: false,
      }),
    );

    expect(result.current.isVideoReady).toBe(false);

    if (videoRef.current) {
      Object.defineProperty(videoRef.current, 'error', {
        configurable: true,
        writable: true,
        value: { code: 4, message: 'decode failed' },
      });
      videoRef.current.dispatchEvent(new Event('error'));
    }

    expect(mockNormalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        context: 'StyledVideoPlayer',
        showToast: false,
        logData: expect.objectContaining({
          errorCode: 4,
          readyState: 4,
          networkState: 2,
          networkStateLabel: 'LOADING',
        }),
      }),
    );
  });
});
