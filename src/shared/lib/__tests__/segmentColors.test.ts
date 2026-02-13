import { describe, it, expect } from 'vitest';
import { SEGMENT_OVERLAY_COLORS, getSegmentFormColor } from '../segmentColors';

describe('SEGMENT_OVERLAY_COLORS', () => {
  it('has 5 color entries', () => {
    expect(SEGMENT_OVERLAY_COLORS).toHaveLength(5);
  });

  it('each entry has bg and text', () => {
    for (const color of SEGMENT_OVERLAY_COLORS) {
      expect(color.bg).toBeTruthy();
      expect(color.text).toBeTruthy();
    }
  });
});

describe('getSegmentFormColor', () => {
  it('returns first color for index 0', () => {
    const color = getSegmentFormColor(0);
    expect(color.bg).toBeTruthy();
    expect(color.bgMuted).toBeTruthy();
    expect(color.text).toBeTruthy();
    expect(color.border).toBeTruthy();
  });

  it('wraps around for indices beyond array length', () => {
    const color0 = getSegmentFormColor(0);
    const color5 = getSegmentFormColor(5);
    expect(color5).toEqual(color0); // 5 % 5 = 0
  });

  it('returns different colors for different indices', () => {
    const color0 = getSegmentFormColor(0);
    const color1 = getSegmentFormColor(1);
    expect(color0.bg).not.toBe(color1.bg);
  });
});
