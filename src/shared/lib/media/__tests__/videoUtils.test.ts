import { describe, it, expect } from 'vitest';
import {
  isValidFrameCount,
  quantizeFrameCount,
  getValidFrameCounts,
  quantizeGap,
  framesToSeconds,
  framesToSecondsValue,
} from '../videoUtils';

describe('isValidFrameCount', () => {
  it('accepts valid 4N+1 values', () => {
    expect(isValidFrameCount(1)).toBe(true);
    expect(isValidFrameCount(5)).toBe(true);
    expect(isValidFrameCount(9)).toBe(true);
    expect(isValidFrameCount(13)).toBe(true);
    expect(isValidFrameCount(81)).toBe(true);
  });

  it('rejects non-4N+1 values', () => {
    expect(isValidFrameCount(2)).toBe(false);
    expect(isValidFrameCount(3)).toBe(false);
    expect(isValidFrameCount(4)).toBe(false);
    expect(isValidFrameCount(6)).toBe(false);
    expect(isValidFrameCount(10)).toBe(false);
  });

  it('rejects 0 and negative', () => {
    expect(isValidFrameCount(0)).toBe(false);
    expect(isValidFrameCount(-1)).toBe(false);
    expect(isValidFrameCount(-5)).toBe(false);
  });
});

describe('quantizeFrameCount', () => {
  it('returns nearest valid value (rounds to nearest)', () => {
    expect(quantizeFrameCount(1)).toBe(1);
    expect(quantizeFrameCount(2)).toBe(1); // (2-1)/4=0.25, rounds to 0, → 1
    expect(quantizeFrameCount(3)).toBe(5); // (3-1)/4=0.5, rounds to 1, → 5
    expect(quantizeFrameCount(4)).toBe(5); // (4-1)/4=0.75, rounds to 1, → 5
    expect(quantizeFrameCount(5)).toBe(5);
    expect(quantizeFrameCount(7)).toBe(9); // (7-1)/4=1.5, rounds to 2, → 9
  });

  it('respects minFrames', () => {
    expect(quantizeFrameCount(1, 5)).toBe(5);
    expect(quantizeFrameCount(3, 5)).toBe(5);
    expect(quantizeFrameCount(10, 5)).toBe(9);
  });

  it('quantizes minFrames to valid 4N+1', () => {
    // minFrames=3 → valid min is 5 (first 4N+1 >= 3)
    expect(quantizeFrameCount(1, 3)).toBe(5);
  });

  it('handles boundary values', () => {
    expect(isValidFrameCount(quantizeFrameCount(50))).toBe(true);
    expect(isValidFrameCount(quantizeFrameCount(100))).toBe(true);
  });
});

describe('getValidFrameCounts', () => {
  it('generates valid frame counts in range', () => {
    const counts = getValidFrameCounts(1, 20);
    expect(counts).toEqual([1, 5, 9, 13, 17]);
  });

  it('returns empty for impossible range', () => {
    const counts = getValidFrameCounts(6, 8);
    expect(counts).toEqual([]);
  });

  it('includes boundary values', () => {
    const counts = getValidFrameCounts(5, 9);
    expect(counts).toEqual([5, 9]);
  });

  it('handles single valid value', () => {
    const counts = getValidFrameCounts(5, 5);
    expect(counts).toEqual([5]);
  });
});

describe('quantizeGap', () => {
  it('enforces minimum gap', () => {
    expect(quantizeGap(1)).toBe(5); // default minGap is 5
    expect(quantizeGap(3)).toBe(5);
  });

  it('quantizes to 4N+1', () => {
    expect(isValidFrameCount(quantizeGap(10))).toBe(true);
    expect(isValidFrameCount(quantizeGap(50))).toBe(true);
  });

  it('uses custom minGap', () => {
    expect(quantizeGap(1, 9)).toBe(9);
  });
});

describe('framesToSeconds', () => {
  it('converts frame 0 to 0.00s', () => {
    expect(framesToSeconds(0)).toBe('0.00s');
  });

  it('converts frame 16 to 1.00s', () => {
    expect(framesToSeconds(16)).toBe('1.00s');
  });

  it('converts frame 8 to 0.50s', () => {
    expect(framesToSeconds(8)).toBe('0.50s');
  });

  it('handles large frame numbers', () => {
    expect(framesToSeconds(160)).toBe('10.00s');
  });
});

describe('framesToSecondsValue', () => {
  it('converts frame 0 to 0', () => {
    expect(framesToSecondsValue(0)).toBe(0);
  });

  it('converts frame 16 to 1', () => {
    expect(framesToSecondsValue(16)).toBe(1);
  });

  it('converts frame 8 to 0.5', () => {
    expect(framesToSecondsValue(8)).toBe(0.5);
  });
});
