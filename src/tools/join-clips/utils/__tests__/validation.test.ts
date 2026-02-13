import { describe, it, expect } from 'vitest';
import {
  calculateEffectiveFrameCount,
  validateClipsForJoin,
  type ClipFrameInfo,
} from '../validation';

describe('calculateEffectiveFrameCount', () => {
  it('calculates frames at default 16fps when not using input video FPS', () => {
    const frames = calculateEffectiveFrameCount(5.0, false);
    expect(frames).toBe(80); // 5 * 16 = 80
  });

  it('calculates frames at input video FPS when enabled', () => {
    const frames = calculateEffectiveFrameCount(5.0, true, 30);
    expect(frames).toBe(150); // 5 * 30 = 150
  });

  it('defaults to 24fps when using input video FPS without a value', () => {
    const frames = calculateEffectiveFrameCount(5.0, true);
    expect(frames).toBe(120); // 5 * 24 = 120
  });

  it('floors the result', () => {
    const frames = calculateEffectiveFrameCount(3.3, false);
    expect(frames).toBe(52); // floor(3.3 * 16) = floor(52.8) = 52
  });

  it('returns 0 for 0 duration', () => {
    const frames = calculateEffectiveFrameCount(0, false);
    expect(frames).toBe(0);
  });
});

describe('validateClipsForJoin', () => {
  function makeClipInfo(index: number, frameCount: number): ClipFrameInfo {
    return {
      index,
      name: `clip-${index}`,
      frameCount,
      source: 'metadata',
    };
  }

  describe('with fewer than 2 clips', () => {
    it('returns invalid for 0 clips', () => {
      const result = validateClipsForJoin([], 15, 23, true);
      expect(result.valid).toBe(false);
      expect(result.shortestClipFrames).toBe(0);
    });

    it('returns invalid for 1 clip', () => {
      const result = validateClipsForJoin([makeClipInfo(0, 100)], 15, 23, true);
      expect(result.valid).toBe(false);
    });
  });

  describe('REPLACE mode', () => {
    it('validates two clips meeting minimum requirement', () => {
      // Minimum: gap + 2*context = 23 + 2*15 = 53
      const clips = [makeClipInfo(0, 100), makeClipInfo(1, 100)];
      const result = validateClipsForJoin(clips, 15, 23, true);
      expect(result.valid).toBe(true);
      expect(result.shortestClipFrames).toBe(100);
      expect(result.minClipFramesRequired).toBe(53); // 23 + 2*15
    });

    it('validates exact boundary condition', () => {
      // Exactly at the limit: gap=23, context=15, min=53
      const clips = [makeClipInfo(0, 53), makeClipInfo(1, 53)];
      const result = validateClipsForJoin(clips, 15, 23, true);
      expect(result.valid).toBe(true);
    });

    it('fails when clips are too short', () => {
      // Below minimum: need 53 but clips have 52
      const clips = [makeClipInfo(0, 52), makeClipInfo(1, 52)];
      const result = validateClipsForJoin(clips, 15, 23, true);
      expect(result.valid).toBe(false);
    });

    it('calculates correct maxSafeGap', () => {
      // maxSafeGap = shortest_clip - 2*context, quantized to 4N+1
      const clips = [makeClipInfo(0, 100), makeClipInfo(1, 80)];
      const result = validateClipsForJoin(clips, 15, 23, true);
      // shortest = 80, max_gap_raw = 80 - 30 = 50
      // quantized: floor((50-1)/4)*4+1 = floor(49/4)*4+1 = 12*4+1 = 49
      expect(result.maxSafeGap).toBe(49);
    });

    it('calculates correct maxSafeContext', () => {
      // maxSafeContext = floor((shortest - gap) / 2)
      const clips = [makeClipInfo(0, 100), makeClipInfo(1, 60)];
      const result = validateClipsForJoin(clips, 15, 23, true);
      // shortest = 60, maxSafeContext = floor((60 - 23) / 2) = floor(18.5) = 18
      expect(result.maxSafeContext).toBe(18);
    });

    it('handles middle clips needing double frames', () => {
      // Middle clips need min_required * 2 because they're used in two transitions
      const clips = [
        makeClipInfo(0, 100),
        makeClipInfo(1, 50),  // Middle clip - needs 53*2=106 frames (NOT enough)
        makeClipInfo(2, 100),
      ];
      const result = validateClipsForJoin(clips, 15, 23, true);
      expect(result.valid).toBe(false); // Middle clip 50 < 106
    });

    it('validates three clips when middle clip has enough frames', () => {
      // Middle needs 53*2 = 106
      const clips = [
        makeClipInfo(0, 53),
        makeClipInfo(1, 110),
        makeClipInfo(2, 53),
      ];
      const result = validateClipsForJoin(clips, 15, 23, true);
      expect(result.valid).toBe(true);
    });
  });

  describe('INSERT mode', () => {
    it('only requires context frames in INSERT mode', () => {
      // INSERT mode: just need context_frame_count from each clip
      const clips = [makeClipInfo(0, 20), makeClipInfo(1, 20)];
      const result = validateClipsForJoin(clips, 15, 23, false);
      expect(result.valid).toBe(true);
      expect(result.minClipFramesRequired).toBe(15); // Just context
    });

    it('fails when clips shorter than context frames', () => {
      const clips = [makeClipInfo(0, 10), makeClipInfo(1, 10)];
      // In insert mode, middle clips need 2*context
      // For 2 clips, first needs context=15 from end, last needs context=15 from start
      // 10 < 15, so invalid
      const result = validateClipsForJoin(clips, 15, 23, false);
      expect(result.valid).toBe(false);
    });

    it('sets maxSafeGap to 81 in INSERT mode', () => {
      const clips = [makeClipInfo(0, 50), makeClipInfo(1, 50)];
      const result = validateClipsForJoin(clips, 15, 23, false);
      expect(result.maxSafeGap).toBe(81);
    });

    it('sets maxSafeContext to shortestClipFrames in INSERT mode', () => {
      const clips = [makeClipInfo(0, 50), makeClipInfo(1, 30)];
      const result = validateClipsForJoin(clips, 15, 23, false);
      expect(result.maxSafeContext).toBe(30);
    });
  });

  describe('edge cases', () => {
    it('handles very small frame counts', () => {
      const clips = [makeClipInfo(0, 1), makeClipInfo(1, 1)];
      const result = validateClipsForJoin(clips, 1, 1, true);
      // min = 1 + 2*1 = 3, but clips have 1 frame each
      expect(result.valid).toBe(false);
    });

    it('handles zero frame context and gap', () => {
      const clips = [makeClipInfo(0, 10), makeClipInfo(1, 10)];
      const result = validateClipsForJoin(clips, 0, 0, true);
      expect(result.valid).toBe(true);
      expect(result.minClipFramesRequired).toBe(0);
    });

    it('uses shortest clip for constraints with mixed sizes', () => {
      const clips = [
        makeClipInfo(0, 200),
        makeClipInfo(1, 50),
        makeClipInfo(2, 300),
      ];
      const result = validateClipsForJoin(clips, 15, 23, true);
      expect(result.shortestClipFrames).toBe(50);
    });
  });
});
