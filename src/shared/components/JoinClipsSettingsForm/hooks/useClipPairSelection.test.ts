import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useClipPairSelection } from './useClipPairSelection';
import type { ClipPairInfo } from '@/shared/components/JoinClipsSettingsForm/types';

const pairA: ClipPairInfo = {
  pairIndex: 0,
  clipA: { name: 'a1', frameCount: 10, finalFrameUrl: 'a1.png' },
  clipB: { name: 'b1', frameCount: 10, posterUrl: 'b1.png' },
};

const pairB: ClipPairInfo = {
  pairIndex: 1,
  clipA: { name: 'a2', frameCount: 12, finalFrameUrl: 'a2.png' },
  clipB: { name: 'b2', frameCount: 12, posterUrl: 'b2.png' },
};

describe('useClipPairSelection', () => {
  it('derives pair flags and selected pair for initial state', () => {
    const { result } = renderHook(() => useClipPairSelection([pairA, pairB]));

    expect(result.current.selectedPairIndex).toBe(0);
    expect(result.current.selectedPair).toEqual(pairA);
    expect(result.current.hasPairs).toBe(true);
    expect(result.current.hasMultiplePairs).toBe(true);
  });

  it('resets to the last valid index when pair count shrinks below selected index', () => {
    const { result, rerender } = renderHook(
      (pairs: ClipPairInfo[] | undefined) => useClipPairSelection(pairs),
      { initialProps: [pairA, pairB] as ClipPairInfo[] | undefined },
    );

    act(() => {
      result.current.setSelectedPairIndex(1);
    });
    expect(result.current.selectedPair).toEqual(pairB);

    rerender([pairA]);
    expect(result.current.selectedPairIndex).toBe(0);
    expect(result.current.selectedPair).toEqual(pairA);
  });

  it('clears selection state when no pairs remain', () => {
    const { result, rerender } = renderHook(
      (pairs: ClipPairInfo[] | undefined) => useClipPairSelection(pairs),
      { initialProps: [pairA] as ClipPairInfo[] | undefined },
    );

    act(() => {
      result.current.setSelectedPairIndex(0);
    });
    rerender(undefined);

    expect(result.current.selectedPairIndex).toBe(0);
    expect(result.current.selectedPair).toBeUndefined();
    expect(result.current.hasPairs).toBe(false);
    expect(result.current.hasMultiplePairs).toBe(false);
  });
});
