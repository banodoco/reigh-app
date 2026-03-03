import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { usePreviewTogetherPlayback } from './usePreviewTogetherPlayback';
import type { PreviewSegment } from '../PreviewTogetherTypes';

function createVideoMock({ paused = true, duration = 4, currentTime = 0 } = {}) {
  const video = document.createElement('video');
  let pausedState = paused;

  Object.defineProperty(video, 'paused', {
    get: () => pausedState,
    configurable: true,
  });
  Object.defineProperty(video, 'duration', {
    value: duration,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(video, 'currentTime', {
    value: currentTime,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(video, 'playbackRate', {
    value: 1,
    writable: true,
    configurable: true,
  });

  const play = vi.fn(() => {
    pausedState = false;
    return Promise.resolve();
  });
  const pause = vi.fn(() => {
    pausedState = true;
  });
  const load = vi.fn();

  Object.defineProperty(video, 'play', { value: play, configurable: true });
  Object.defineProperty(video, 'pause', { value: pause, configurable: true });
  Object.defineProperty(video, 'load', { value: load, configurable: true });

  return { video, play, pause, load };
}

function createAudioMock({ currentTime = 0 } = {}) {
  const audio = document.createElement('audio');
  Object.defineProperty(audio, 'currentTime', {
    value: currentTime,
    writable: true,
    configurable: true,
  });
  const play = vi.fn(() => Promise.resolve());
  const pause = vi.fn();
  Object.defineProperty(audio, 'play', { value: play, configurable: true });
  Object.defineProperty(audio, 'pause', { value: pause, configurable: true });
  return { audio, play, pause };
}

function buildSegments(): PreviewSegment[] {
  return [
    {
      index: 10,
      hasVideo: true,
      videoUrl: 'https://cdn.example.com/segment-10.mp4',
      thumbUrl: 'https://cdn.example.com/segment-10.jpg',
      startImageUrl: null,
      endImageUrl: null,
      durationFromFrames: 2,
    },
    {
      index: 20,
      hasVideo: true,
      videoUrl: 'https://cdn.example.com/segment-20.mp4',
      thumbUrl: 'https://cdn.example.com/segment-20.jpg',
      startImageUrl: null,
      endImageUrl: null,
      durationFromFrames: 3,
    },
    {
      index: 30,
      hasVideo: true,
      videoUrl: 'https://cdn.example.com/segment-30.mp4',
      thumbUrl: 'https://cdn.example.com/segment-30.jpg',
      startImageUrl: null,
      endImageUrl: null,
      durationFromFrames: 4,
    },
  ];
}

describe('usePreviewTogetherPlayback', () => {
  it('initializes to requested pair index and supports wrapped navigation', async () => {
    const segments = buildSegments();
    const { result } = renderHook(() =>
      usePreviewTogetherPlayback({
        isOpen: true,
        previewableSegments: segments,
        audioUrl: null,
        initialPairIndex: 20,
      }),
    );

    await waitFor(() => {
      expect(result.current.currentPreviewIndex).toBe(1);
    });

    act(() => {
      result.current.handleNavigate('prev');
    });
    expect(result.current.currentPreviewIndex).toBe(0);

    act(() => {
      result.current.handleNavigate('prev');
    });
    expect(result.current.currentPreviewIndex).toBe(2);

    act(() => {
      result.current.handleNavigate('next');
    });
    expect(result.current.currentPreviewIndex).toBe(0);
  });

  it('resets state and audio when modal closes', async () => {
    const segments = buildSegments();
    const { audio, pause } = createAudioMock({ currentTime: 5 });

    const { result, rerender } = renderHook(
      ({ isOpen }) =>
        usePreviewTogetherPlayback({
          isOpen,
          previewableSegments: segments,
          audioUrl: 'https://cdn.example.com/audio.mp3',
          initialPairIndex: 30,
        }),
      { initialProps: { isOpen: true } },
    );

    act(() => {
      result.current.previewAudioRef.current = audio;
    });

    await waitFor(() => {
      expect(result.current.currentPreviewIndex).toBe(2);
    });

    act(() => {
      result.current.handleNavigate('prev');
    });
    expect(result.current.currentPreviewIndex).toBe(1);

    act(() => {
      rerender({ isOpen: false });
    });

    expect(result.current.currentPreviewIndex).toBe(0);
    expect(result.current.previewCurrentTime).toBe(0);
    expect(result.current.previewDuration).toBe(0);
    expect(result.current.previewIsPlaying).toBe(false);
    expect(result.current.isPreviewVideoLoading).toBe(true);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(audio.currentTime).toBe(0);
  });

  it('toggles audio off and on for non-video segments', () => {
    const segments: PreviewSegment[] = [
      {
        index: 1,
        hasVideo: false,
        videoUrl: null,
        thumbUrl: 'https://cdn.example.com/segment.jpg',
        startImageUrl: null,
        endImageUrl: null,
        durationFromFrames: 2,
      },
    ];
    const { audio, play, pause } = createAudioMock();

    const { result } = renderHook(() =>
      usePreviewTogetherPlayback({
        isOpen: true,
        previewableSegments: segments,
        audioUrl: 'https://cdn.example.com/audio.mp3',
        initialPairIndex: 1,
      }),
    );

    act(() => {
      result.current.previewAudioRef.current = audio;
    });

    play.mockClear();
    pause.mockClear();

    act(() => {
      result.current.handleToggleAudio();
    });
    expect(result.current.isAudioEnabled).toBe(false);
    expect(pause).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.handleToggleAudio();
    });
    expect(result.current.isAudioEnabled).toBe(true);
    expect(play).toHaveBeenCalled();
  });

  it('handles loaded metadata and seek updates for active video slot', () => {
    const segments = buildSegments();
    const { video, play } = createVideoMock({ duration: 4, paused: true });

    const { result } = renderHook(() =>
      usePreviewTogetherPlayback({
        isOpen: true,
        previewableSegments: segments,
        audioUrl: null,
        initialPairIndex: 10,
      }),
    );

    act(() => {
      result.current.previewVideoRef.current = video;
    });

    const handlers = result.current.createVideoHandlers('A');
    act(() => {
      handlers.onLoadedMetadata();
    });

    expect(video.playbackRate).toBe(2);
    expect(result.current.previewDuration).toBe(2);
    expect(result.current.previewCurrentTime).toBe(0);
    expect(result.current.isPreviewVideoLoading).toBe(false);
    expect(play).toHaveBeenCalled();

    act(() => {
      result.current.handleSeek(1.5);
    });
    expect(video.currentTime).toBe(1.5);
    expect(result.current.previewCurrentTime).toBe(1.5);
  });
});
