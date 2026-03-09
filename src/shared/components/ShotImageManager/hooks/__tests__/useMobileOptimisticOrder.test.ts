// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMobileOptimisticOrder } from '../useMobileOptimisticOrder';
import type { GenerationRow } from '@/domains/generation/types';

function createImage(id: string): GenerationRow {
  return {
    id,
    imageUrl: `${id}.png`,
    createdAt: `2026-03-09T00:00:0${id.length}Z`,
  };
}

describe('useMobileOptimisticOrder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('uses optimistic order until the server order catches up', async () => {
    const initialImages = [createImage('a'), createImage('b')];
    const optimisticImages = [createImage('b'), createImage('a')];
    const { result, rerender } = renderHook(
      ({ images }) => useMobileOptimisticOrder(images),
      { initialProps: { images: initialImages } },
    );

    act(() => {
      result.current.setOptimisticOrder(optimisticImages);
      result.current.setIsOptimisticUpdate(true);
    });

    expect(result.current.currentImages.map((image) => image.id)).toEqual(['b', 'a']);
    expect(result.current.isOptimisticUpdate).toBe(true);

    act(() => {
      rerender({ images: optimisticImages });
    });

    expect(result.current.optimisticOrder).toEqual([]);
    expect(result.current.currentImages.map((image) => image.id)).toEqual(['b', 'a']);
  });

  it('drops optimistic state when the server changes by more than one image', () => {
    const initialImages = [createImage('a'), createImage('b')];
    const { result, rerender } = renderHook(
      ({ images }) => useMobileOptimisticOrder(images),
      { initialProps: { images: initialImages } },
    );

    act(() => {
      result.current.setOptimisticOrder([createImage('b'), createImage('a')]);
      result.current.setIsOptimisticUpdate(true);
    });

    rerender({ images: [createImage('a'), createImage('b'), createImage('c'), createImage('d')] });

    expect(result.current.isOptimisticUpdate).toBe(false);
    expect(result.current.optimisticOrder).toEqual([]);
    expect(result.current.currentImages.map((image) => image.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('times out stale optimistic state after five seconds', () => {
    const initialImages = [createImage('a'), createImage('b')];
    const { result } = renderHook(() => useMobileOptimisticOrder(initialImages));

    act(() => {
      result.current.setOptimisticOrder([createImage('b'), createImage('a')]);
      result.current.setIsOptimisticUpdate(true);
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.isOptimisticUpdate).toBe(false);
    expect(result.current.optimisticOrder).toEqual([]);
    expect(result.current.currentImages.map((image) => image.id)).toEqual(['a', 'b']);
  });
});
