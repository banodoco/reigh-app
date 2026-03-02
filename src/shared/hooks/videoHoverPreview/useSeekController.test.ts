import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSeekController } from './useSeekController';

function createVideoWithReadyState(initialReadyState: number) {
  const video = document.createElement('video');
  let readyState = initialReadyState;

  Object.defineProperty(video, 'readyState', {
    get: () => readyState,
    configurable: true,
  });
  Object.defineProperty(video, 'videoWidth', {
    value: 640,
    configurable: true,
  });
  Object.defineProperty(video, 'videoHeight', {
    value: 360,
    configurable: true,
  });
  Object.defineProperty(video, 'currentTime', {
    value: 1,
    writable: true,
    configurable: true,
  });

  return {
    video,
    setReadyState: (value: number) => {
      readyState = value;
    },
  };
}

describe('useSeekController', () => {
  it('is not ready when video ref is missing and seekToFrame is a safe no-op', async () => {
    const { result } = renderHook(() =>
      useSeekController({
        videoRef: { current: null },
        canvasRef: { current: null },
        videoUrl: 'video-a',
        frameRate: 30,
        seekThrottleMs: 50,
      }),
    );

    expect(result.current.isVideoReady).toBe(false);
    await expect(result.current.seekToFrame(15)).resolves.toBeUndefined();
  });

  it('updates ready state when video dispatches canplay', () => {
    const { video, setReadyState } = createVideoWithReadyState(1);

    const { result } = renderHook(() =>
      useSeekController({
        videoRef: { current: video },
        canvasRef: { current: document.createElement('canvas') },
        videoUrl: 'video-b',
        frameRate: 30,
        seekThrottleMs: 50,
      }),
    );

    expect(result.current.isVideoReady).toBe(false);

    act(() => {
      setReadyState(2);
      video.dispatchEvent(new Event('canplay'));
    });

    expect(result.current.isVideoReady).toBe(true);
  });

  it('draws to canvas when target frame is already at current time', async () => {
    const { video } = createVideoWithReadyState(4);
    const canvas = document.createElement('canvas');
    const drawImage = vi.fn();
    const clearRect = vi.fn();
    const getImageData = vi.fn(() => ({
      data: new Uint8ClampedArray([0, 0, 0, 255]),
    }));
    vi.spyOn(canvas, 'getContext').mockReturnValue({
      drawImage,
      clearRect,
      getImageData,
    } as never);

    const { result } = renderHook(() =>
      useSeekController({
        videoRef: { current: video },
        canvasRef: { current: canvas },
        videoUrl: 'video-c',
        frameRate: 30,
        seekThrottleMs: 50,
      }),
    );

    await act(async () => {
      await result.current.seekToFrame(30);
    });

    expect(drawImage).toHaveBeenCalled();
    expect(clearRect).toHaveBeenCalled();
    expect(getImageData).toHaveBeenCalled();
  });
});
