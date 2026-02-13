import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVideoHoverPreview } from '../useVideoHoverPreview';

describe('useVideoHoverPreview', () => {
  describe('initialization', () => {
    it('returns default state', () => {
      const { result } = renderHook(() =>
        useVideoHoverPreview({ videoUrl: 'test.mp4', frameRate: 30 })
      );

      expect(result.current.currentFrame).toBe(-1);
      expect(result.current.isVideoReady).toBe(false);
      expect(result.current.isHovering).toBe(false);
      expect(result.current.hoverPosition).toEqual({ x: 0, y: 0 });
    });

    it('returns refs for canvas and video', () => {
      const { result } = renderHook(() =>
        useVideoHoverPreview({ videoUrl: 'test.mp4', frameRate: 30 })
      );

      expect(result.current.canvasRef).toBeDefined();
      expect(result.current.videoRef).toBeDefined();
    });
  });

  describe('handleMouseEnter', () => {
    it('sets isHovering to true', () => {
      const { result } = renderHook(() =>
        useVideoHoverPreview({ videoUrl: 'test.mp4', frameRate: 30 })
      );

      act(() => {
        result.current.handleMouseEnter();
      });

      expect(result.current.isHovering).toBe(true);
    });
  });

  describe('handleMouseLeave', () => {
    it('sets isHovering to false', () => {
      const { result } = renderHook(() =>
        useVideoHoverPreview({ videoUrl: 'test.mp4', frameRate: 30 })
      );

      act(() => {
        result.current.handleMouseEnter();
      });
      act(() => {
        result.current.handleMouseLeave();
      });

      expect(result.current.isHovering).toBe(false);
    });
  });

  describe('updateHoverPosition', () => {
    it('updates hover position without frame', () => {
      const { result } = renderHook(() =>
        useVideoHoverPreview({ videoUrl: 'test.mp4', frameRate: 30 })
      );

      act(() => {
        result.current.updateHoverPosition(100, 200);
      });

      expect(result.current.hoverPosition).toEqual({ x: 100, y: 200 });
    });

    it('updates current frame when frame is provided', () => {
      const { result } = renderHook(() =>
        useVideoHoverPreview({ videoUrl: 'test.mp4', frameRate: 30 })
      );

      act(() => {
        result.current.updateHoverPosition(100, 200, 15);
      });

      expect(result.current.hoverPosition).toEqual({ x: 100, y: 200 });
      expect(result.current.currentFrame).toBe(15);
    });

    it('does not update frame when same as current', () => {
      const { result } = renderHook(() =>
        useVideoHoverPreview({ videoUrl: 'test.mp4', frameRate: 30 })
      );

      act(() => {
        result.current.updateHoverPosition(100, 200, 15);
      });

      // Same frame - should not trigger another seek
      act(() => {
        result.current.updateHoverPosition(150, 250, 15);
      });

      expect(result.current.hoverPosition).toEqual({ x: 150, y: 250 });
      expect(result.current.currentFrame).toBe(15);
    });
  });

  describe('reset', () => {
    it('resets all state to initial values', () => {
      const { result } = renderHook(() =>
        useVideoHoverPreview({ videoUrl: 'test.mp4', frameRate: 30 })
      );

      act(() => {
        result.current.handleMouseEnter();
        result.current.updateHoverPosition(100, 200, 15);
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.isHovering).toBe(false);
      expect(result.current.currentFrame).toBe(-1);
    });
  });

  describe('options', () => {
    it('accepts custom seekThrottleMs', () => {
      const { result } = renderHook(() =>
        useVideoHoverPreview({
          videoUrl: 'test.mp4',
          frameRate: 24,
          seekThrottleMs: 50,
        })
      );

      // Should not crash
      expect(result.current).toBeDefined();
    });

    it('accepts enabled flag', () => {
      const { result } = renderHook(() =>
        useVideoHoverPreview({
          videoUrl: 'test.mp4',
          frameRate: 30,
          enabled: false,
        })
      );

      expect(result.current).toBeDefined();
    });
  });
});
