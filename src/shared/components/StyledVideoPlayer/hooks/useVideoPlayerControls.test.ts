// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVideoPlayerControls } from './useVideoPlayerControls';

function createVideoRef() {
  const video = document.createElement('video');
  Object.defineProperty(video, 'paused', {
    configurable: true,
    writable: true,
    value: true,
  });
  Object.defineProperty(video, 'muted', {
    configurable: true,
    writable: true,
    value: false,
  });
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    writable: true,
    value: 0,
  });
  video.play = vi.fn().mockResolvedValue(undefined);
  video.pause = vi.fn();
  video.requestFullscreen = vi.fn().mockResolvedValue(undefined);
  return { current: video } as React.RefObject<HTMLVideoElement>;
}

describe('useVideoPlayerControls', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      writable: true,
      value: null,
    });
    document.exitFullscreen = vi.fn().mockResolvedValue(undefined);
  });

  it('plays and pauses the video while syncing playing state', () => {
    const videoRef = createVideoRef();
    const setIsPlaying = vi.fn();
    const { result } = renderHook(() =>
      useVideoPlayerControls({
        videoRef,
        isMobile: false,
        duration: 20,
        setIsPlaying,
        setIsMuted: vi.fn(),
        setCurrentTime: vi.fn(),
      }),
    );

    act(() => {
      result.current.togglePlayPause();
    });

    expect(videoRef.current?.play).toHaveBeenCalled();
    expect(setIsPlaying).toHaveBeenCalledWith(true);

    if (videoRef.current) {
      Object.defineProperty(videoRef.current, 'paused', {
        configurable: true,
        writable: true,
        value: false,
      });
    }

    act(() => {
      result.current.togglePlayPause();
    });

    expect(videoRef.current?.pause).toHaveBeenCalled();
    expect(setIsPlaying).toHaveBeenCalledWith(false);
  });

  it('updates mute, timeline position, and fullscreen state from user actions', () => {
    const videoRef = createVideoRef();
    const setIsMuted = vi.fn();
    const setCurrentTime = vi.fn();
    const { result } = renderHook(() =>
      useVideoPlayerControls({
        videoRef,
        isMobile: false,
        duration: 40,
        setIsPlaying: vi.fn(),
        setIsMuted,
        setCurrentTime,
      }),
    );

    act(() => {
      result.current.toggleMute();
    });
    expect(videoRef.current?.muted).toBe(true);
    expect(setIsMuted).toHaveBeenCalledWith(true);

    act(() => {
      result.current.handleTimelineChange({
        target: { value: '25' },
      } as React.ChangeEvent<HTMLInputElement>);
    });
    expect(videoRef.current?.currentTime).toBe(10);
    expect(setCurrentTime).toHaveBeenCalledWith(10);

    act(() => {
      result.current.toggleFullscreen();
    });
    expect(videoRef.current?.requestFullscreen).toHaveBeenCalled();

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      writable: true,
      value: document.body,
    });
    act(() => {
      result.current.toggleFullscreen();
    });
    expect(document.exitFullscreen).toHaveBeenCalled();
  });

  it('only toggles playback when clicking the video surface', () => {
    const videoRef = createVideoRef();
    const setIsPlaying = vi.fn();
    const { result } = renderHook(() =>
      useVideoPlayerControls({
        videoRef,
        isMobile: false,
        duration: 20,
        setIsPlaying,
        setIsMuted: vi.fn(),
        setCurrentTime: vi.fn(),
      }),
    );
    const currentTarget = document.createElement('div');
    const nestedButton = document.createElement('button');
    const stopPropagation = vi.fn();

    act(() => {
      result.current.handleContainerClick({
        target: nestedButton,
        currentTarget,
        stopPropagation,
      } as unknown as React.MouseEvent);
    });
    expect(setIsPlaying).not.toHaveBeenCalled();

    act(() => {
      result.current.handleContainerClick({
        target: currentTarget,
        currentTarget,
        stopPropagation,
      } as unknown as React.MouseEvent);
    });
    expect(stopPropagation).toHaveBeenCalled();
    expect(setIsPlaying).toHaveBeenCalledWith(true);
  });
});
