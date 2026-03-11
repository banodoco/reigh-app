// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSeekController } from './useSeekController';

type VideoListener = (event?: Event) => void;

function createMockVideo(overrides: Record<string, unknown> = {}) {
  const listeners = new Map<string, Set<VideoListener>>();

  const video = {
    readyState: 4,
    currentTime: 0,
    videoWidth: 640,
    videoHeight: 360,
    addEventListener: vi.fn((event: string, listener: VideoListener) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(listener);
    }),
    removeEventListener: vi.fn((event: string, listener: VideoListener) => {
      listeners.get(event)?.delete(listener);
    }),
    load: vi.fn(),
    emit(event: string) {
      for (const listener of [...(listeners.get(event) ?? [])]) {
        listener(new Event(event));
      }
    },
    ...overrides,
  } as unknown as HTMLVideoElement & { emit: (event: string) => void };

  return video;
}

function createMockCanvas() {
  const context = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray([
        0, 0, 0, 255,
        0, 0, 0, 255,
        0, 0, 0, 255,
        0, 0, 0, 255,
      ]),
    })),
  };

  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement;

  return { canvas, context };
}

describe('useSeekController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:10.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('tracks video readiness from the attached media events', () => {
    const video = createMockVideo({ readyState: 1 });
    const { canvas } = createMockCanvas();

    const { result } = renderHook(() => useSeekController({
      videoRef: { current: video },
      canvasRef: { current: canvas },
      videoUrl: 'preview.mp4',
      frameRate: 30,
      seekThrottleMs: 50,
    }));

    expect(result.current.isVideoReady).toBe(false);

    act(() => {
      video.readyState = 3;
      video.emit('canplay');
    });

    expect(result.current.isVideoReady).toBe(true);
  });

  it('draws immediately when the requested frame is already loaded', async () => {
    const video = createMockVideo({
      readyState: 4,
      currentTime: 1,
      videoWidth: 800,
      videoHeight: 450,
    });
    const { canvas, context } = createMockCanvas();
    const { result } = renderHook(() => useSeekController({
      videoRef: { current: video },
      canvasRef: { current: canvas },
      videoUrl: 'preview.mp4',
      frameRate: 30,
      seekThrottleMs: 50,
    }));

    await act(async () => {
      await result.current.seekToFrame(30);
    });

    expect(video.currentTime).toBe(1);
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(450);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 800, 450);
    expect(context.drawImage).toHaveBeenCalledWith(video, 0, 0);
  });

  it('loads the video and waits for readiness before performing the seek', async () => {
    const video = createMockVideo({ readyState: 1, currentTime: 0 });
    const { canvas, context } = createMockCanvas();
    const { result } = renderHook(() => useSeekController({
      videoRef: { current: video },
      canvasRef: { current: canvas },
      videoUrl: 'preview.mp4',
      frameRate: 30,
      seekThrottleMs: 50,
    }));

    const seekPromise = result.current.seekToFrame(15);

    expect(video.load).toHaveBeenCalledTimes(1);

    act(() => {
      video.readyState = 3;
      video.emit('canplay');
    });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      video.emit('seeked');
    });

    await seekPromise;

    expect(video.currentTime).toBe(0.5);
    expect(context.drawImage).toHaveBeenCalledWith(video, 0, 0);
  });

  it('throttles repeated seeks and replays the latest pending frame after the delay', async () => {
    const video = createMockVideo({ readyState: 4, currentTime: 0 });
    const { canvas, context } = createMockCanvas();
    const { result } = renderHook(() => useSeekController({
      videoRef: { current: video },
      canvasRef: { current: canvas },
      videoUrl: 'preview.mp4',
      frameRate: 10,
      seekThrottleMs: 50,
    }));

    const firstSeek = result.current.seekToFrame(10);

    await act(async () => {
      await Promise.resolve();
    });

    expect(video.currentTime).toBe(1);

    act(() => {
      video.emit('seeked');
    });

    await firstSeek;

    await result.current.seekToFrame(20);
    expect(video.currentTime).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
      await Promise.resolve();
    });

    expect(video.currentTime).toBe(2);

    act(() => {
      video.emit('seeked');
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(context.drawImage).toHaveBeenCalledTimes(2);

    act(() => {
      result.current.resetSeekState();
    });

    const resetSeek = result.current.seekToFrame(30);

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      video.emit('seeked');
    });

    await resetSeek;

    expect(video.currentTime).toBe(3);
  });
});
