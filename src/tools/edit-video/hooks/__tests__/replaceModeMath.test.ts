import { describe, expect, it } from 'vitest';
import type { PortionSelection } from '@/shared/components/VideoPortionTimeline';
import {
  calculateGapFramesFromRange,
  calculateMaxContextFrames,
  capContextFrameCountForRanges,
  getNewSelectionRange,
  quantizeGapFrameCount,
  selectionsToFrameRanges,
  validatePortionSelections,
} from '../replaceModeMath';

describe('replaceModeMath', () => {
  it('quantizes gap frame counts to 4n+1', () => {
    expect(quantizeGapFrameCount(1)).toBe(1);
    expect(quantizeGapFrameCount(17)).toBe(17);
    expect(quantizeGapFrameCount(20)).toBe(21);
  });

  it('falls back to the provided gap frame count when fps is unavailable', () => {
    const gap = calculateGapFramesFromRange({
      start: 1,
      end: 2,
      fps: null,
      fallbackGapFrameCount: 12,
      contextFrameCount: 8,
    });

    expect(gap).toBe(12);
  });

  it('caps computed gap frames by context-frame constraints', () => {
    const gap = calculateGapFramesFromRange({
      start: 0,
      end: 1,
      fps: 20,
      fallbackGapFrameCount: 12,
      contextFrameCount: 40,
    });

    expect(gap).toBe(1);
  });

  it('prefers appending new selections after the last range when space exists', () => {
    const selections: PortionSelection[] = [
      { id: 'a', start: 1, end: 2, gapFrameCount: 12, prompt: '' },
      { id: 'b', start: 4, end: 5, gapFrameCount: 12, prompt: '' },
    ];

    const next = getNewSelectionRange(selections, 10);
    expect(next).toEqual({ start: 6, end: 7 });
  });

  it('uses space before the first selection when appending overflows', () => {
    const selections: PortionSelection[] = [
      { id: 'a', start: 2, end: 9, gapFrameCount: 12, prompt: '' },
    ];

    const next = getNewSelectionRange(selections, 10);
    expect(next).toEqual({ start: 0, end: 1 });
  });

  it('validates overlapping and out-of-bounds selections', () => {
    const result = validatePortionSelections({
      selections: [
        { id: 'a', start: 0.4, end: 1.4, gapFrameCount: 12, prompt: '' },
        { id: 'b', start: 1.0, end: 2.1, gapFrameCount: 12, prompt: '' },
      ],
      videoFps: 16,
      videoDuration: 2,
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Portions overlap');
    expect(result.errors).toContain('Portion #2: Extends past video end');
  });

  it('derives safe max context frame count from keeper segments', () => {
    const frameRanges = selectionsToFrameRanges(
      [
        { id: 'a', start: 2, end: 3, gapFrameCount: 12, prompt: '' },
        { id: 'b', start: 7, end: 8, gapFrameCount: 12, prompt: '' },
      ],
      10,
      10,
      12,
      ''
    );

    expect(calculateMaxContextFrames({ videoFps: 10, videoDuration: 10, frameRanges })).toBe(19);
    expect(capContextFrameCountForRanges({ contextFrameCount: 24, totalFrames: 100, frameRanges })).toBe(19);
  });
});
