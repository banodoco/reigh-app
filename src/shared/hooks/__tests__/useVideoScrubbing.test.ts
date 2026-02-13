import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVideoScrubbing } from '../useVideoScrubbing';

describe('useVideoScrubbing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('returns default state', () => {
      const { result } = renderHook(() => useVideoScrubbing());

      expect(result.current.progress).toBe(0);
      expect(result.current.currentTime).toBe(0);
      expect(result.current.duration).toBe(0);
      expect(result.current.scrubberPosition).toBeNull();
      expect(result.current.scrubberVisible).toBe(true);
      expect(result.current.isHovering).toBe(false);
      expect(result.current.isPlaying).toBe(false);
    });

    it('returns stable refs', () => {
      const { result, rerender } = renderHook(() => useVideoScrubbing());

      const firstContainerRef = result.current.containerRef;
      const firstVideoRef = result.current.videoRef;
      rerender();
      expect(result.current.containerRef).toBe(firstContainerRef);
      expect(result.current.videoRef).toBe(firstVideoRef);
    });

    it('returns containerProps and videoProps', () => {
      const { result } = renderHook(() => useVideoScrubbing());

      expect(result.current.containerProps).toHaveProperty('onMouseMove');
      expect(result.current.containerProps).toHaveProperty('onMouseEnter');
      expect(result.current.containerProps).toHaveProperty('onMouseLeave');
      expect(result.current.videoProps).toHaveProperty('onLoadedMetadata');
    });
  });

  describe('setDuration', () => {
    it('sets duration for valid values', () => {
      const { result } = renderHook(() => useVideoScrubbing());

      act(() => {
        result.current.setDuration(10.5);
      });

      expect(result.current.duration).toBe(10.5);
    });

    it('ignores non-finite values', () => {
      const { result } = renderHook(() => useVideoScrubbing());

      act(() => {
        result.current.setDuration(10);
      });
      act(() => {
        result.current.setDuration(Infinity);
      });

      expect(result.current.duration).toBe(10);
    });

    it('ignores zero and negative values', () => {
      const { result } = renderHook(() => useVideoScrubbing());

      act(() => {
        result.current.setDuration(10);
      });
      act(() => {
        result.current.setDuration(0);
      });

      expect(result.current.duration).toBe(10);

      act(() => {
        result.current.setDuration(-5);
      });

      expect(result.current.duration).toBe(10);
    });

    it('ignores NaN', () => {
      const { result } = renderHook(() => useVideoScrubbing());

      act(() => {
        result.current.setDuration(10);
      });
      act(() => {
        result.current.setDuration(NaN);
      });

      expect(result.current.duration).toBe(10);
    });
  });

  describe('setVideoElement', () => {
    it('accepts a video element', () => {
      const { result } = renderHook(() => useVideoScrubbing());

      const mockVideo = {
        duration: 5,
        currentTime: 0,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as HTMLVideoElement;

      act(() => {
        result.current.setVideoElement(mockVideo);
      });

      // Should update duration from the video element
      expect(result.current.duration).toBe(5);
    });

    it('handles null video element', () => {
      const { result } = renderHook(() => useVideoScrubbing());

      act(() => {
        result.current.setVideoElement(null);
      });

      // Should not crash
      expect(result.current.duration).toBe(0);
    });

    it('ignores non-finite video duration', () => {
      const { result } = renderHook(() => useVideoScrubbing());

      const mockVideo = {
        duration: NaN,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as HTMLVideoElement;

      act(() => {
        result.current.setVideoElement(mockVideo);
      });

      expect(result.current.duration).toBe(0);
    });
  });

  describe('seekToProgress', () => {
    it('clamps progress to [0, 1]', () => {
      const { result } = renderHook(() => useVideoScrubbing());

      act(() => {
        result.current.setDuration(10);
      });

      act(() => {
        result.current.seekToProgress(1.5);
      });
      expect(result.current.progress).toBe(1);

      act(() => {
        result.current.seekToProgress(-0.5);
      });
      expect(result.current.progress).toBe(0);
    });

    it('sets progress and currentTime', () => {
      const { result } = renderHook(() => useVideoScrubbing());

      act(() => {
        result.current.setDuration(10);
      });

      act(() => {
        result.current.seekToProgress(0.5);
      });

      expect(result.current.progress).toBe(0.5);
      expect(result.current.currentTime).toBe(5);
    });

    it('calls onProgressChange callback', () => {
      const onProgressChange = vi.fn();
      const { result } = renderHook(() =>
        useVideoScrubbing({ onProgressChange })
      );

      act(() => {
        result.current.setDuration(10);
      });

      act(() => {
        result.current.seekToProgress(0.3);
      });

      expect(onProgressChange).toHaveBeenCalledWith(0.3, 3);
    });

    it('does nothing when duration is 0', () => {
      const { result } = renderHook(() => useVideoScrubbing());

      act(() => {
        result.current.seekToProgress(0.5);
      });

      expect(result.current.progress).toBe(0);
      expect(result.current.currentTime).toBe(0);
    });
  });

  describe('reset', () => {
    it('resets all state to initial values', () => {
      const { result } = renderHook(() => useVideoScrubbing());

      // Set some state first
      act(() => {
        result.current.setDuration(10);
      });
      act(() => {
        result.current.seekToProgress(0.5);
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.progress).toBe(0);
      expect(result.current.currentTime).toBe(0);
      expect(result.current.scrubberPosition).toBeNull();
      expect(result.current.scrubberVisible).toBe(true);
      expect(result.current.isPlaying).toBe(false);
    });
  });

  describe('mouse handlers', () => {
    it('handleMouseEnter sets hovering state', () => {
      const onHoverStart = vi.fn();
      const { result } = renderHook(() =>
        useVideoScrubbing({ onHoverStart })
      );

      act(() => {
        result.current.containerProps.onMouseEnter();
      });

      expect(result.current.isHovering).toBe(true);
      expect(onHoverStart).toHaveBeenCalled();
    });

    it('handleMouseLeave clears hovering state', () => {
      const onHoverEnd = vi.fn();
      const { result } = renderHook(() =>
        useVideoScrubbing({ onHoverEnd })
      );

      act(() => {
        result.current.containerProps.onMouseEnter();
      });
      act(() => {
        result.current.containerProps.onMouseLeave();
      });

      expect(result.current.isHovering).toBe(false);
      expect(result.current.scrubberPosition).toBeNull();
      expect(onHoverEnd).toHaveBeenCalled();
    });

    it('does nothing when disabled', () => {
      const onHoverStart = vi.fn();
      const { result } = renderHook(() =>
        useVideoScrubbing({ enabled: false, onHoverStart })
      );

      act(() => {
        result.current.containerProps.onMouseEnter();
      });

      expect(result.current.isHovering).toBe(false);
      expect(onHoverStart).not.toHaveBeenCalled();
    });
  });
});
