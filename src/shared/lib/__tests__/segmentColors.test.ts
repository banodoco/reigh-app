import { describe, it, expect } from 'vitest';
import { SEGMENT_OVERLAY_COLORS, getSegmentFormColor } from '../segmentColors';

describe('SEGMENT_OVERLAY_COLORS', () => {
  it('defines the expected ordered overlay palette', () => {
    expect(SEGMENT_OVERLAY_COLORS).toEqual([
      { bg: 'bg-primary/40', text: 'text-primary' },
      { bg: 'bg-blue-500/40', text: 'text-blue-400' },
      { bg: 'bg-green-500/40', text: 'text-green-400' },
      { bg: 'bg-orange-500/40', text: 'text-orange-400' },
      { bg: 'bg-purple-500/40', text: 'text-purple-400' },
    ]);

    for (const color of SEGMENT_OVERLAY_COLORS) {
      expect(color.bg).toContain('/40');
      expect(color.text.startsWith('text-')).toBe(true);
    }
  });
});

describe('getSegmentFormColor', () => {
  it('maps each index to the expected form color tuple', () => {
    expect(getSegmentFormColor(0)).toEqual({
      bg: 'bg-primary',
      bgMuted: 'bg-primary/20',
      text: 'text-primary',
      border: 'border-primary',
    });
    expect(getSegmentFormColor(1)).toEqual({
      bg: 'bg-blue-500',
      bgMuted: 'bg-blue-500/20',
      text: 'text-blue-500',
      border: 'border-blue-500',
    });
    expect(getSegmentFormColor(2)).toEqual({
      bg: 'bg-green-500',
      bgMuted: 'bg-green-500/20',
      text: 'text-green-500',
      border: 'border-green-500',
    });
    expect(getSegmentFormColor(3)).toEqual({
      bg: 'bg-orange-500',
      bgMuted: 'bg-orange-500/20',
      text: 'text-orange-500',
      border: 'border-orange-500',
    });
    expect(getSegmentFormColor(4)).toEqual({
      bg: 'bg-purple-500',
      bgMuted: 'bg-purple-500/20',
      text: 'text-purple-500',
      border: 'border-purple-500',
    });
  });

  it('wraps by modulo for out-of-range positive indices', () => {
    expect(getSegmentFormColor(5)).toEqual(getSegmentFormColor(0));
    expect(getSegmentFormColor(11)).toEqual(getSegmentFormColor(1));
  });
});
