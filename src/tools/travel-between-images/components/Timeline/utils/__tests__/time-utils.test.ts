import { describe, it, expect } from 'vitest';
import {
  isValidFrameCount,
  quantizeFrameCount,
  getValidFrameCounts,
  quantizeGap,
  framesToSeconds,
} from '../time-utils';

// time-utils re-exports from shared/lib/videoUtils — verify the re-exports work

describe('time-utils re-exports', () => {
  it('re-exports isValidFrameCount', () => {
    expect(isValidFrameCount(5)).toBe(true);
    expect(isValidFrameCount(6)).toBe(false);
  });

  it('re-exports quantizeFrameCount', () => {
    expect(quantizeFrameCount(3)).toBe(5);
    expect(quantizeFrameCount(5)).toBe(5);
  });

  it('re-exports getValidFrameCounts', () => {
    const counts = getValidFrameCounts(1, 10);
    expect(counts).toEqual([1, 5, 9]);
  });

  it('re-exports quantizeGap', () => {
    expect(quantizeGap(1)).toBe(5);
  });

  it('re-exports framesToSeconds', () => {
    expect(framesToSeconds(0)).toBe('0.00s');
    expect(framesToSeconds(16)).toBe('1.00s');
  });
});
