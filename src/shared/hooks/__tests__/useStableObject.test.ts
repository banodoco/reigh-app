import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStableObject } from '../useStableObject';

describe('useStableObject', () => {
  it('returns the object from factory on initial render', () => {
    const { result } = renderHook(() =>
      useStableObject(() => ({ a: 1, b: 'hello' }), [1, 'hello'])
    );
    expect(result.current).toEqual({ a: 1, b: 'hello' });
  });

  it('returns the same reference when deps have not changed', () => {
    const { result, rerender } = renderHook(
      ({ deps }) => useStableObject(() => ({ x: deps[0] }), deps),
      { initialProps: { deps: [42] as unknown[] } }
    );
    const first = result.current;

    rerender({ deps: [42] });
    expect(result.current).toBe(first);
  });

  it('returns a new object when deps change', () => {
    const { result, rerender } = renderHook(
      ({ deps }) => useStableObject(() => ({ x: deps[0] }), deps),
      { initialProps: { deps: [1] as unknown[] } }
    );
    const first = result.current;

    rerender({ deps: [2] });
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual({ x: 2 });
  });

  it('does not recreate when factory changes but deps stay the same', () => {
    let factoryCallCount = 0;
    const { result, rerender } = renderHook(
      ({ value }) =>
        useStableObject(() => {
          factoryCallCount++;
          return { v: value };
        }, [value]),
      { initialProps: { value: 'stable' } }
    );

    const first = result.current;
    expect(factoryCallCount).toBe(1);

    // Rerender with same value -- factory reference changes but deps don't
    rerender({ value: 'stable' });
    expect(result.current).toBe(first);
    expect(factoryCallCount).toBe(1);
  });

  it('recreates when dependency list length changes', () => {
    const { result, rerender } = renderHook(
      ({ deps }) => useStableObject(() => ({ len: deps.length }), deps),
      { initialProps: { deps: [1, 2] as unknown[] } }
    );
    const first = result.current;

    rerender({ deps: [1, 2, 3] });
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual({ len: 3 });
  });

  it('handles empty dependency list', () => {
    const { result, rerender } = renderHook(
      () => useStableObject(() => ({ constant: true }), [])
    );
    const first = result.current;

    rerender();
    expect(result.current).toBe(first);
  });
});
