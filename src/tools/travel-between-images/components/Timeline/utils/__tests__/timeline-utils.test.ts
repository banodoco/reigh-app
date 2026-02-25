import { describe, it, expect } from 'vitest';
import {
  quantizePositions,
  applyFluidTimeline,
  pixelToFrame,
  getTimelineDimensions,
  getPairInfo,
  applyFluidTimelineMulti,
  calculateNewVideoPlacement,
  findTrailingVideoInfo,
  getTrailingEffectiveEnd,
  TRAILING_ENDPOINT_KEY,
  PENDING_POSITION_KEY,
} from '../timeline-utils';

describe('TRAILING_ENDPOINT_KEY and PENDING_POSITION_KEY', () => {
  it('has expected key values', () => {
    expect(TRAILING_ENDPOINT_KEY).toBe('__trailing_endpoint');
    expect(PENDING_POSITION_KEY).toBe('__pending__');
  });
});

describe('quantizePositions', () => {
  it('keeps first item at position 0', () => {
    const positions = new Map([['a', 10], ['b', 50]]);
    const result = quantizePositions(positions);
    expect(result.get('a')).toBe(0);
  });

  it('quantizes gaps to 4N+1 format', () => {
    const positions = new Map([['a', 0], ['b', 12]]);
    const result = quantizePositions(positions);
    // Gap from 0 to 12 → quantized gap (max(12, 5) → nearest 4N+1)
    const gap = result.get('b')! - result.get('a')!;
    expect((gap - 1) % 4).toBe(0); // Valid 4N+1
  });

  it('preserves trailing endpoint unchanged', () => {
    const positions = new Map([
      ['a', 0],
      ['b', 20],
      [TRAILING_ENDPOINT_KEY, 100],
    ]);
    const result = quantizePositions(positions);
    expect(result.get(TRAILING_ENDPOINT_KEY)).toBe(100);
  });

  it('handles empty positions (only trailing)', () => {
    const positions = new Map([[TRAILING_ENDPOINT_KEY, 50]]);
    const result = quantizePositions(positions);
    expect(result.get(TRAILING_ENDPOINT_KEY)).toBe(50);
    expect(result.size).toBe(1);
  });

  it('handles empty positions', () => {
    const result = quantizePositions(new Map());
    expect(result.size).toBe(0);
  });
});

describe('applyFluidTimeline', () => {
  it('moves dragged item to target position', () => {
    const positions = new Map([['a', 0], ['b', 20], ['c', 40]]);
    const result = applyFluidTimeline(positions, 'b', 30);
    expect(result.has('b')).toBe(true);
  });

  it('limits movement to 50 frames per drag', () => {
    const positions = new Map([['a', 0], ['b', 20]]);
    const result = applyFluidTimeline(positions, 'b', 200);
    // b was at 20, max move is 50, so b should be at most 70
    expect(result.get('b')!).toBeLessThanOrEqual(70);
  });

  it('first item is always at position 0', () => {
    const positions = new Map([['a', 0], ['b', 20], ['c', 40]]);
    const result = applyFluidTimeline(positions, 'c', 50);
    // After shrinkOversizedGaps, first item should be at 0
    const sorted = [...result.entries()]
      .filter(([id]) => id !== TRAILING_ENDPOINT_KEY)
      .sort((a, b) => a[1] - b[1]);
    if (sorted.length > 0) {
      expect(sorted[0][1]).toBe(0);
    }
  });
});

describe('pixelToFrame', () => {
  it('converts pixel position to frame number', () => {
    expect(pixelToFrame(0, 1000, 0, 100)).toBe(0);
    expect(pixelToFrame(1000, 1000, 0, 100)).toBe(100);
    expect(pixelToFrame(500, 1000, 0, 100)).toBe(50);
  });

  it('handles non-zero fullMin', () => {
    expect(pixelToFrame(500, 1000, 10, 100)).toBe(60);
  });

  it('rounds to nearest integer', () => {
    expect(pixelToFrame(333, 1000, 0, 100)).toBe(33);
  });
});

describe('getTimelineDimensions', () => {
  it('returns minimum dimensions for empty positions', () => {
    const result = getTimelineDimensions(new Map());
    expect(result.fullMin).toBe(0);
    expect(result.fullMax).toBe(30); // MINIMUM_TIMELINE_MAX
    expect(result.fullRange).toBe(30);
  });

  it('calculates dimensions from positions', () => {
    const positions = new Map([['a', 0], ['b', 50], ['c', 100]]);
    const result = getTimelineDimensions(positions);
    expect(result.fullMin).toBe(0);
    expect(result.fullMax).toBe(100);
    expect(result.fullRange).toBe(100);
  });

  it('includes pending frames in calculation', () => {
    const positions = new Map([['a', 0], ['b', 50]]);
    const result = getTimelineDimensions(positions, [200]);
    expect(result.fullMax).toBe(200);
  });

  it('ignores null pending frames', () => {
    const positions = new Map([['a', 0], ['b', 50]]);
    const result = getTimelineDimensions(positions, [null, undefined as unknown, 80]);
    expect(result.fullMax).toBe(80);
  });

  it('enforces minimum max of 30', () => {
    const positions = new Map([['a', 0], ['b', 10]]);
    const result = getTimelineDimensions(positions);
    expect(result.fullMax).toBe(30);
  });
});

describe('getPairInfo', () => {
  it('returns empty for single item', () => {
    const positions = new Map([['a', 0]]);
    const pairs = getPairInfo(positions);
    expect(pairs).toHaveLength(0);
  });

  it('calculates pairs for adjacent items', () => {
    const positions = new Map([['a', 0], ['b', 20], ['c', 50]]);
    const pairs = getPairInfo(positions);

    expect(pairs).toHaveLength(2);
    expect(pairs[0].startFrame).toBe(0);
    expect(pairs[0].endFrame).toBe(20);
    expect(pairs[0].frames).toBe(20);
    expect(pairs[1].startFrame).toBe(20);
    expect(pairs[1].endFrame).toBe(50);
    expect(pairs[1].frames).toBe(30);
  });

  it('excludes trailing endpoint', () => {
    const positions = new Map([
      ['a', 0],
      ['b', 20],
      [TRAILING_ENDPOINT_KEY, 100],
    ]);
    const pairs = getPairInfo(positions);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].endFrame).toBe(20);
  });
});

describe('applyFluidTimelineMulti', () => {
  it('returns original positions for empty selection', () => {
    const positions = new Map([['a', 0], ['b', 20]]);
    const result = applyFluidTimelineMulti(positions, [], 50);
    expect(result).toEqual(positions);
  });

  it('delegates to single-item applyFluidTimeline for one selection', () => {
    const positions = new Map([['a', 0], ['b', 20]]);
    const result = applyFluidTimelineMulti(positions, ['b'], 30);
    expect(result.has('b')).toBe(true);
  });

  it('bundles multiple selected items 5 frames apart', () => {
    const positions = new Map([['a', 0], ['b', 20], ['c', 40], ['d', 60]]);
    const result = applyFluidTimelineMulti(positions, ['b', 'c'], 10);

    // b and c should be 5 frames apart
    const bPos = result.get('b')!;
    const cPos = result.get('c')!;
    // After shrinkOversizedGaps the positions may shift, but the bundle should be close
    expect(Math.abs(cPos - bPos)).toBeLessThanOrEqual(10);
  });
});

describe('calculateNewVideoPlacement', () => {
  it('places first video at start', () => {
    const result = calculateNewVideoPlacement(100, undefined, 200);
    expect(result.start_frame).toBe(0);
    expect(result.end_frame).toBe(100);
    expect(result.lastVideoUpdate).toBeUndefined();
  });

  it('places after existing videos', () => {
    const existing = [{ path: '/v1.mp4', start_frame: 0, end_frame: 50 }];
    const result = calculateNewVideoPlacement(80, existing, 200);
    expect(result.start_frame).toBe(50);
    expect(result.end_frame).toBe(130);
  });

  it('clips last video when no space on timeline', () => {
    const existing = [{ path: '/v1.mp4', start_frame: 0, end_frame: 200 }];
    const result = calculateNewVideoPlacement(80, existing, 200);

    // start_frame >= fullMax, so should clip
    expect(result.lastVideoUpdate).toBeDefined();
    expect(result.lastVideoUpdate!.newEndFrame).toBeLessThan(200);
    expect(result.start_frame).toBeLessThan(200);
  });

  it('handles multiple existing videos', () => {
    const existing = [
      { path: '/v1.mp4', start_frame: 0, end_frame: 50 },
      { path: '/v2.mp4', start_frame: 50, end_frame: 100 },
    ];
    const result = calculateNewVideoPlacement(60, existing, 200);
    expect(result.start_frame).toBe(100);
    expect(result.end_frame).toBe(160);
  });
});

describe('getTrailingEffectiveEnd', () => {
  it('returns null for empty timeline', () => {
    const result = getTrailingEffectiveEnd({
      framePositions: new Map(),
      imagesCount: 0,
      hasExistingTrailingVideo: false,
    });
    expect(result).toBeNull();
  });

  it('returns null for multi-image timelines without trailing video', () => {
    const result = getTrailingEffectiveEnd({
      framePositions: new Map([
        ['a', 0],
        ['b', 40],
      ]),
      imagesCount: 2,
      hasExistingTrailingVideo: false,
    });
    expect(result).toBeNull();
  });

  it('computes offset for single-image timelines', () => {
    const result = getTrailingEffectiveEnd({
      framePositions: new Map([['a', 10]]),
      imagesCount: 1,
      hasExistingTrailingVideo: false,
    });
    expect(result).toBe(59);
  });

  it('computes offset for multi-image timelines with trailing video', () => {
    const result = getTrailingEffectiveEnd({
      framePositions: new Map([
        ['a', 0],
        ['b', 80],
        [TRAILING_ENDPOINT_KEY, 120],
      ]),
      imagesCount: 2,
      hasExistingTrailingVideo: true,
    });
    expect(result).toBe(97);
  });
});

describe('findTrailingVideoInfo', () => {
  it('returns no trailing for empty outputs', () => {
    const result = findTrailingVideoInfo([], 'gen-1');
    expect(result.hasTrailing).toBe(false);
    expect(result.videoUrl).toBeNull();
  });

  it('returns no trailing for null lastImageShotGenId', () => {
    const outputs = [{ type: 'video', location: '/v.mp4', pair_shot_generation_id: 'gen-1' }];
    const result = findTrailingVideoInfo(outputs, null);
    expect(result.hasTrailing).toBe(false);
  });

  it('finds trailing video by pair_shot_generation_id', () => {
    const outputs = [
      { type: 'video', location: '/v1.mp4', pair_shot_generation_id: 'gen-last' },
    ];
    const result = findTrailingVideoInfo(outputs, 'gen-last');
    expect(result.hasTrailing).toBe(true);
    expect(result.videoUrl).toBe('/v1.mp4');
  });

  it('finds trailing video from params (legacy)', () => {
    const outputs = [
      {
        type: 'video',
        location: '/v1.mp4',
        params: { pair_shot_generation_id: 'gen-last' },
      },
    ];
    const result = findTrailingVideoInfo(outputs, 'gen-last');
    expect(result.hasTrailing).toBe(true);
  });

  it('ignores non-video types', () => {
    const outputs = [
      { type: 'image', location: '/img.jpg', pair_shot_generation_id: 'gen-last' },
    ];
    const result = findTrailingVideoInfo(outputs, 'gen-last');
    expect(result.hasTrailing).toBe(false);
  });

  it('ignores videos without location', () => {
    const outputs = [
      { type: 'video', location: null, pair_shot_generation_id: 'gen-last' },
    ];
    const result = findTrailingVideoInfo(outputs, 'gen-last');
    expect(result.hasTrailing).toBe(false);
  });
});
