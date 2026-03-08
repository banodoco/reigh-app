import { describe, expect, it } from 'vitest';
import { getClipFrameCalculations } from './clipFrameCalculations';
import type { ClipPairInfo } from '@/shared/components/JoinClipsSettingsForm/types';

const selectedPair: ClipPairInfo = {
  pairIndex: 0,
  clipA: { name: 'clip-a', frameCount: 50, finalFrameUrl: 'a.png' },
  clipB: { name: 'clip-b', frameCount: 60, posterUrl: 'b.png' },
};

describe('getClipFrameCalculations', () => {
  it('computes insert-mode values and keeps frames as null without a selected pair', () => {
    const result = getClipFrameCalculations({
      gapFrames: 24,
      contextFrames: 8,
      replaceMode: false,
      selectedPair: undefined,
    });

    expect(result.totalFrames).toBe(40);
    expect(result.anchor1Idx).toBe(8);
    expect(result.anchor2Idx).toBe(16);
    expect(result.clipAKeptFrames).toBeNull();
    expect(result.clipBKeptFrames).toBeNull();
    expect(result.totalGenerationFlex).toBe(24);
    expect(result.contextFlex).toBe(8);
    expect(result.generationWindowLeftPct).toBeCloseTo(18.75, 6);
    expect(result.generationWindowWidthPct).toBeCloseTo(62.5, 6);
  });

  it('computes replace-mode usage and kept-frame counts with selected pair data', () => {
    const result = getClipFrameCalculations({
      gapFrames: 15,
      contextFrames: 10,
      replaceMode: true,
      selectedPair,
    });

    // In replace mode, generation window spans context + gap + context.
    expect(result.totalFrames).toBe(35);
    expect(result.totalGenerationFlex).toBe(35);
    expect(result.contextFlex).toBe(10);

    // Clip A uses context + ceil(gap/2) = 10 + 8 = 18; Clip B uses context + floor(gap/2) = 10 + 7 = 17.
    expect(result.clipAKeptFrames).toBe(32);
    expect(result.clipBKeptFrames).toBe(43);
    expect(result.generationWindowLeftPct).toBeCloseTo(25, 6);
    expect(result.generationWindowWidthPct).toBeCloseTo(50, 6);
  });

  it('never returns negative kept frames when clips are shorter than required context/gap usage', () => {
    const shortPair: ClipPairInfo = {
      pairIndex: 1,
      clipA: { name: 'short-a', frameCount: 6, finalFrameUrl: undefined },
      clipB: { name: 'short-b', frameCount: 7, posterUrl: undefined },
    };

    const result = getClipFrameCalculations({
      gapFrames: 11,
      contextFrames: 6,
      replaceMode: true,
      selectedPair: shortPair,
    });

    expect(result.clipAKeptFrames).toBe(0);
    expect(result.clipBKeptFrames).toBe(0);
  });
});
