import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLightboxOpen } from '../useLightboxOpen';
import {
  __resetLightboxOpenStateForTests,
  acquireLightboxOpenState,
} from '../../state/lightboxOpenState';

describe('useLightboxOpen', () => {
  afterEach(() => {
    __resetLightboxOpenStateForTests();
  });

  it('returns false by default', () => {
    const { result } = renderHook(() => useLightboxOpen());
    expect(result.current).toBe(false);
  });

  it('returns true when state is already acquired before mount', () => {
    const release = acquireLightboxOpenState();
    const { result } = renderHook(() => useLightboxOpen());
    expect(result.current).toBe(true);
    act(() => {
      release();
    });
  });

  it('reacts when a lightbox opens', () => {
    const { result } = renderHook(() => useLightboxOpen());
    expect(result.current).toBe(false);

    let release: () => void = () => {};
    act(() => {
      release = acquireLightboxOpenState();
    });

    expect(result.current).toBe(true);
    act(() => {
      release();
    });
  });

  it('supports nested open handles and closes only when all are released', () => {
    const { result } = renderHook(() => useLightboxOpen());
    expect(result.current).toBe(false);

    let releaseFirst: () => void = () => {};
    let releaseSecond: () => void = () => {};

    act(() => {
      releaseFirst = acquireLightboxOpenState();
      releaseSecond = acquireLightboxOpenState();
    });
    expect(result.current).toBe(true);

    act(() => {
      releaseFirst();
    });
    expect(result.current).toBe(true);

    act(() => {
      releaseSecond();
    });
    expect(result.current).toBe(false);
  });
});
