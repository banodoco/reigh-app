import { describe, it, expect } from 'vitest';
import {
  calculateAverageSpacing,
  ensureUniqueFrame,
  calculateFrameForIndex,
  calculateNextAvailableFrame,
  extractExistingFrames,
  DEFAULT_FRAME_SPACING,
} from '../timelinePositionCalculator';

describe('calculateAverageSpacing', () => {
  it('returns default spacing for less than 2 items', () => {
    expect(calculateAverageSpacing([])).toBe(DEFAULT_FRAME_SPACING);
    expect(calculateAverageSpacing([10])).toBe(DEFAULT_FRAME_SPACING);
  });

  it('calculates average from evenly spaced frames', () => {
    expect(calculateAverageSpacing([0, 20, 40])).toBe(20);
  });

  it('calculates average from unevenly spaced frames', () => {
    // [0, 10, 50] → span=50, gaps=2, avg=25
    expect(calculateAverageSpacing([0, 10, 50])).toBe(25);
  });

  it('clamps to minimum spacing (10)', () => {
    // Very close frames [0, 1, 2] → span=2, gaps=2, avg=1 → clamped to 10
    expect(calculateAverageSpacing([0, 1, 2])).toBe(10);
  });

  it('clamps to max DEFAULT_FRAME_SPACING', () => {
    // Very spread frames [0, 1000] → span=1000, gaps=1, avg=1000 → clamped to 50
    expect(calculateAverageSpacing([0, 1000])).toBe(DEFAULT_FRAME_SPACING);
  });

  it('uses custom default spacing', () => {
    expect(calculateAverageSpacing([], 30)).toBe(30);
  });

  it('handles unsorted input', () => {
    expect(calculateAverageSpacing([40, 0, 20])).toBe(20);
  });
});

describe('ensureUniqueFrame', () => {
  it('returns target when no collision', () => {
    expect(ensureUniqueFrame(10, [0, 5, 20])).toBe(10);
  });

  it('finds next available when collision', () => {
    // 10 is taken, tries 11 (not taken)
    expect(ensureUniqueFrame(10, [10])).toBe(11);
  });

  it('searches both directions for available slot', () => {
    // 10 taken → tries 11 (taken) → tries 9 (available)
    expect(ensureUniqueFrame(10, [10, 11])).toBe(9);
  });

  it('does not go below 0', () => {
    // 0, 1 taken → should go to 2, not -1
    expect(ensureUniqueFrame(0, [0, 1])).toBe(2);
  });

  it('normalizes negative to 0', () => {
    expect(ensureUniqueFrame(-5, [])).toBe(0);
  });

  it('rounds non-integer targets', () => {
    expect(ensureUniqueFrame(10.7, [])).toBe(11);
  });
});

describe('calculateFrameForIndex', () => {
  it('returns 0 for empty timeline', () => {
    expect(calculateFrameForIndex(0, [])).toBe(0);
  });

  it('inserts at beginning (half of first frame)', () => {
    // First frame is 20 → target is 10
    expect(calculateFrameForIndex(0, [20, 40])).toBe(10);
  });

  it('inserts at end using average spacing', () => {
    // Frames [0, 20, 40], spacing = 20, last = 40, target = 60
    const result = calculateFrameForIndex(3, [0, 20, 40]);
    expect(result).toBe(60);
  });

  it('inserts in middle at midpoint', () => {
    // Between 0 and 40 → midpoint is 20
    expect(calculateFrameForIndex(1, [0, 40])).toBe(20);
  });

  it('handles collisions when inserting', () => {
    // Midpoint of 0 and 2 is 1, but 1 is already taken
    const result = calculateFrameForIndex(1, [0, 1, 2]);
    expect([0, 1, 2]).not.toContain(result);
  });

  it('uses explicit spacing when provided', () => {
    const result = calculateFrameForIndex(2, [0, 10], 30);
    expect(result).toBe(40); // last (10) + explicit (30)
  });
});

describe('calculateNextAvailableFrame', () => {
  it('returns 0 for empty timeline', () => {
    expect(calculateNextAvailableFrame([])).toBe(0);
  });

  it('appends after max with average spacing', () => {
    // [0, 20, 40] → avg spacing 20, max 40 → 60
    expect(calculateNextAvailableFrame([0, 20, 40])).toBe(60);
  });

  it('uses explicit spacing when provided', () => {
    expect(calculateNextAvailableFrame([0, 10], 30)).toBe(40);
  });

  it('returns unique frame (no collision)', () => {
    const existing = [0, 20, 40];
    const result = calculateNextAvailableFrame(existing);
    expect(existing).not.toContain(result);
  });
});

describe('extractExistingFrames', () => {
  it('extracts valid frame numbers', () => {
    const items = [
      { timeline_frame: 0 },
      { timeline_frame: 20 },
      { timeline_frame: 40 },
    ];
    expect(extractExistingFrames(items)).toEqual([0, 20, 40]);
  });

  it('filters out null/undefined frames', () => {
    const items = [
      { timeline_frame: 10 },
      { timeline_frame: null },
      { timeline_frame: undefined },
      { timeline_frame: 30 },
    ];
    expect(extractExistingFrames(items)).toEqual([10, 30]);
  });

  it('filters out -1 sentinel values', () => {
    const items = [
      { timeline_frame: 10 },
      { timeline_frame: -1 },
      { timeline_frame: 30 },
    ];
    expect(extractExistingFrames(items)).toEqual([10, 30]);
  });

  it('filters out video type items', () => {
    const items = [
      { timeline_frame: 10, type: 'image' },
      { timeline_frame: 20, type: 'video' },
      { timeline_frame: 30 },
    ];
    expect(extractExistingFrames(items)).toEqual([10, 30]);
  });

  it('returns empty array for empty input', () => {
    expect(extractExistingFrames([])).toEqual([]);
  });
});
