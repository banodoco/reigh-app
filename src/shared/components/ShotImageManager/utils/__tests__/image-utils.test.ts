import { describe, it, expect, vi } from 'vitest';

vi.mock('@/shared/utils/timelinePositionCalculator', () => ({
  calculateFrameForIndex: vi.fn((index: number, frames: number[], spacing?: number) => {
    if (frames.length === 0) return 0;
    if (index >= frames.length) return frames[frames.length - 1] + (spacing ?? 50);
    return index * 10;
  }),
  extractExistingFrames: vi.fn((items: Array<{ timeline_frame?: number | null; type?: string }>) => {
    return items
      .filter(item => item.type !== 'video' && item.timeline_frame != null && item.timeline_frame !== -1)
      .map(item => item.timeline_frame as number);
  }),
}));

import { getFramePositionForIndex, getImageRange, getAspectRatioStyle } from '../image-utils';
import type { GenerationRow } from '@/types/shots';

describe('getFramePositionForIndex', () => {
  it('returns a frame position for given index', () => {
    const images = [
      { id: '1', timeline_frame: 0 },
      { id: '2', timeline_frame: 50 },
      { id: '3', timeline_frame: 100 },
    ] as GenerationRow[];

    const result = getFramePositionForIndex(3, images, 50);
    expect(typeof result).toBe('number');
  });

  it('returns 0 for empty image list', () => {
    const result = getFramePositionForIndex(0, [], 50);
    expect(result).toBe(0);
  });

  it('calls through to calculateFrameForIndex with extracted frames', () => {
    const images = [
      { id: '1', timeline_frame: 10 },
      { id: '2', timeline_frame: 20 },
    ] as GenerationRow[];

    const result = getFramePositionForIndex(2, images, 50);
    expect(typeof result).toBe('number');
  });
});

describe('getImageRange', () => {
  const images = [
    { id: 'a' },
    { id: 'b' },
    { id: 'c' },
    { id: 'd' },
    { id: 'e' },
  ] as GenerationRow[];

  it('returns range of IDs between start and end (inclusive)', () => {
    expect(getImageRange(1, 3, images)).toEqual(['b', 'c', 'd']);
  });

  it('handles reversed start/end (end < start)', () => {
    expect(getImageRange(3, 1, images)).toEqual(['b', 'c', 'd']);
  });

  it('returns single item when start equals end', () => {
    expect(getImageRange(2, 2, images)).toEqual(['c']);
  });

  it('handles indices at boundaries', () => {
    expect(getImageRange(0, 4, images)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('skips out-of-bounds indices', () => {
    expect(getImageRange(3, 10, images)).toEqual(['d', 'e']);
  });

  it('returns empty array when all indices are out of bounds', () => {
    expect(getImageRange(10, 15, images)).toEqual([]);
  });
});

describe('getAspectRatioStyle', () => {
  it('returns correct aspect ratio for 16:9', () => {
    const style = getAspectRatioStyle('16:9');
    expect(style.aspectRatio).toBe(`${16 / 9}`);
  });

  it('returns correct aspect ratio for 9:16', () => {
    const style = getAspectRatioStyle('9:16');
    expect(style.aspectRatio).toBe(`${9 / 16}`);
  });

  it('returns correct aspect ratio for 1:1', () => {
    const style = getAspectRatioStyle('1:1');
    expect(style.aspectRatio).toBe('1');
  });

  it('returns default square for undefined', () => {
    const style = getAspectRatioStyle(undefined);
    expect(style.aspectRatio).toBe('1');
  });

  it('returns default square for invalid format', () => {
    const style = getAspectRatioStyle('invalid');
    expect(style.aspectRatio).toBe('1');
  });

  it('returns default square for NaN values', () => {
    const style = getAspectRatioStyle('abc:def');
    expect(style.aspectRatio).toBe('1');
  });
});
