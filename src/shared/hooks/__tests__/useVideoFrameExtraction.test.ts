import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

import { useVideoFrameExtraction } from '../useVideoFrameExtraction';

describe('useVideoFrameExtraction', () => {
  let mockVideo: Record<string, unknown>;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    mockVideo = {
      crossOrigin: '',
      muted: false,
      playsInline: false,
      preload: '',
      src: '',
      readyState: 0,
      videoWidth: 0,
      videoHeight: 0,
      currentTime: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      load: vi.fn(),
    };

    // Save the real createElement
    originalCreateElement = document.createElement.bind(document);

    // Override createElement to intercept 'video' and 'canvas' creation
    document.createElement = vi.fn((tag: string) => {
      if (tag === 'video') return mockVideo as unknown as HTMLVideoElement;
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: vi.fn().mockReturnValue({
            drawImage: vi.fn(),
          }),
          toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,test'),
        } as unknown as HTMLCanvasElement;
      }
      // For other elements, call the original
      return originalCreateElement(tag);
    }) as unknown as typeof document.createElement;
  });

  afterEach(() => {
    // Restore original
    document.createElement = originalCreateElement;
  });

  it('returns empty frames initially', () => {
    const { result } = renderHook(() =>
      useVideoFrameExtraction('video.mp4', {
        metadata: null,
        treatment: 'adjust',
        sourceRange: { start: 0, end: 100 },
        outputFrameCount: 80,
      })
    );

    expect(result.current.frames).toEqual([]);
    expect(result.current.isExtracting).toBe(false);
    expect(result.current.isReady).toBe(false);
  });

  it('skips extraction when skip=true', () => {
    const { result } = renderHook(() =>
      useVideoFrameExtraction('video.mp4', {
        metadata: { total_frames: 100, frame_rate: 30, width: 1920, height: 1080, duration: 3.33 },
        treatment: 'adjust',
        sourceRange: { start: 0, end: 100 },
        outputFrameCount: 80,
        skip: true,
      })
    );

    expect(result.current.frames).toEqual([]);
    expect(result.current.isExtracting).toBe(false);
  });

  it('skips extraction when metadata is null', () => {
    const { result } = renderHook(() =>
      useVideoFrameExtraction('video.mp4', {
        metadata: null,
        treatment: 'adjust',
        sourceRange: { start: 0, end: 100 },
        outputFrameCount: 80,
      })
    );

    expect(result.current.frames).toEqual([]);
    expect(result.current.isExtracting).toBe(false);
  });

  it('creates a video element for extraction', () => {
    renderHook(() =>
      useVideoFrameExtraction('video.mp4', {
        metadata: { total_frames: 100, frame_rate: 30, width: 1920, height: 1080, duration: 3.33 },
        treatment: 'adjust',
        sourceRange: { start: 0, end: 100 },
        outputFrameCount: 80,
      })
    );

    // Verify video element was created and configured
    expect(document.createElement).toHaveBeenCalledWith('video');
    expect(mockVideo.crossOrigin).toBe('anonymous');
    expect(mockVideo.muted).toBe(true);
    expect(mockVideo.src).toBe('video.mp4');
  });

  it('cleans up video element on unmount', () => {
    const { unmount } = renderHook(() =>
      useVideoFrameExtraction('video.mp4', {
        metadata: { total_frames: 100, frame_rate: 30, width: 1920, height: 1080, duration: 3.33 },
        treatment: 'adjust',
        sourceRange: { start: 0, end: 100 },
        outputFrameCount: 80,
      })
    );

    unmount();

    // After unmount, video.src should be cleared
    expect(mockVideo.src).toBe('');
  });

  it('accepts quality parameter', () => {
    const { result } = renderHook(() =>
      useVideoFrameExtraction('video.mp4', {
        metadata: null,
        treatment: 'adjust',
        sourceRange: { start: 0, end: 100 },
        outputFrameCount: 80,
        quality: 0.8,
      })
    );

    expect(result.current.frames).toEqual([]);
  });

  it('accepts maxFrames parameter', () => {
    const { result } = renderHook(() =>
      useVideoFrameExtraction('video.mp4', {
        metadata: null,
        treatment: 'clip',
        sourceRange: { start: 10, end: 50 },
        outputFrameCount: 40,
        maxFrames: 20,
      })
    );

    expect(result.current.frames).toEqual([]);
  });
});
