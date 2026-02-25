import { describe, expect, it } from 'vitest';
import { calculateDuplicateFrame } from '@/shared/lib/timelinePositionCalculator';

describe('calculateDuplicateFrame', () => {
  it('uses trailing frame in single-item mode', () => {
    const frame = calculateDuplicateFrame({
      currentFrame: 10,
      existingFrames: [10],
      singleItemTrailingFrame: 60,
      isSingleItem: true,
    });

    expect(frame).toBe(60);
  });

  it('uses midpoint when next frame exists', () => {
    const frame = calculateDuplicateFrame({
      currentFrame: 10,
      nextFrame: 30,
      existingFrames: [10, 30],
      isSingleItem: false,
    });

    expect(frame).toBe(20);
  });

  it('falls back to duplicate gap and applies collision handling', () => {
    const frame = calculateDuplicateFrame({
      currentFrame: 10,
      existingFrames: [10, 40],
      isSingleItem: false,
    });

    // default duplicate gap would target 40, so collision resolution picks the next free frame
    expect(frame).toBe(41);
  });
});
