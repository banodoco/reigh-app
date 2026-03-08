import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useJoinClipsSettingsController } from './useJoinClipsSettingsController';

describe('useJoinClipsSettingsController', () => {
  it('computes defaults without clip constraints and exposes helper functions', () => {
    const setGapFrames = vi.fn();
    const setContextFrames = vi.fn();

    const { result } = renderHook(() =>
      useJoinClipsSettingsController({
        gapFrames: 10,
        setGapFrames,
        contextFrames: 6,
        setContextFrames,
        replaceMode: false,
        shortestClipFrames: undefined,
        keepBridgingImagesValue: false,
      }),
    );

    expect(result.current.maxGapFrames).toBe(69);
    expect(result.current.maxContextFrames).toBe(30);
    expect(result.current.minClipFramesRequired).toBe(6);
    expect(result.current.actualTotal).toBe(22);
    expect(result.current.quantizedTotal).toBe(21);
    expect(result.current.sliderNumber(7)).toBe(7);
    expect(result.current.sliderNumber([9])).toBe(9);
    expect(result.current.sliderNumber([])).toBe(0);

    result.current.handleContextFramesChange(2);
    expect(setContextFrames).toHaveBeenCalledWith(4);
    expect(setGapFrames).not.toHaveBeenCalled();
  });

  it('clamps invalid gap/context when shortest-clip replace-mode limits are exceeded', () => {
    const setGapFrames = vi.fn();
    const setContextFrames = vi.fn();

    const { result } = renderHook(() =>
      useJoinClipsSettingsController({
        gapFrames: 60,
        setGapFrames,
        contextFrames: 20,
        setContextFrames,
        replaceMode: true,
        shortestClipFrames: 70,
        keepBridgingImagesValue: false,
      }),
    );

    expect(result.current.maxGapFrames).toBe(29);
    expect(result.current.maxContextFrames).toBe(5);
    expect(result.current.minClipFramesRequired).toBe(100);
    expect(result.current.actualTotal).toBe(100);
    expect(result.current.quantizedTotal).toBe(101);

    expect(setGapFrames).toHaveBeenCalledWith(29);
    expect(setContextFrames).toHaveBeenCalledWith(5);
  });

  it('turns off bridging images when gap is too small', () => {
    const setGapFrames = vi.fn();
    const setContextFrames = vi.fn();
    const setKeepBridgingImages = vi.fn();

    renderHook(() =>
      useJoinClipsSettingsController({
        gapFrames: 8,
        setGapFrames,
        contextFrames: 5,
        setContextFrames,
        replaceMode: false,
        shortestClipFrames: 40,
        keepBridgingImagesValue: true,
        setKeepBridgingImages,
      }),
    );

    expect(setKeepBridgingImages).toHaveBeenCalledWith(false);
  });
});
