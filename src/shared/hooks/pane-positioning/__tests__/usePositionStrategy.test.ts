import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePositionStrategy } from '../usePositionStrategy';
import type { PanePosition } from '@/shared/config/panes';

describe('usePositionStrategy', () => {
  it('returns left pane style', () => {
    const position: PanePosition = {
      side: 'left',
      dimension: 300,
      offsets: { bottom: 0 },
      isVisible: true,
    };
    const { result } = renderHook(() => usePositionStrategy(position));
    expect(result.current.position).toBe('fixed');
    expect(result.current.left).toBe('0px');
  });

  it('returns right pane style', () => {
    const position: PanePosition = {
      side: 'right',
      dimension: 300,
      offsets: { bottom: 0 },
      isVisible: true,
    };
    const { result } = renderHook(() => usePositionStrategy(position));
    expect(result.current.position).toBe('fixed');
    expect(result.current.right).toBe('0px');
  });

  it('returns bottom pane style', () => {
    const position: PanePosition = {
      side: 'bottom',
      dimension: 350,
      offsets: { horizontal: 0 },
      isVisible: true,
    };
    const { result } = renderHook(() => usePositionStrategy(position));
    expect(result.current.position).toBe('fixed');
    expect(result.current.left).toBe('50%');
    expect(result.current.bottom).toBe('0px');
  });

  it('memoizes result for same position', () => {
    const position: PanePosition = {
      side: 'left',
      dimension: 300,
      offsets: { bottom: 0 },
      isVisible: true,
    };
    const { result, rerender } = renderHook(() => usePositionStrategy(position));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
