// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('lightboxOpenState', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('tracks whether any lightbox holders are currently acquired', async () => {
    const state = await import('./lightboxOpenState');
    const { result } = renderHook(() => state.useLightboxOpenState());

    expect(result.current).toBe(false);

    let release!: () => void;
    act(() => {
      release = state.acquireLightboxOpenState();
    });
    expect(result.current).toBe(true);

    act(() => {
      release();
    });

    expect(result.current).toBe(false);
  });

  it('requires all acquisitions to release before reporting the lightbox as closed', async () => {
    const state = await import('./lightboxOpenState');
    const { result } = renderHook(() => state.useLightboxOpenState());

    let releaseA!: () => void;
    let releaseB!: () => void;
    act(() => {
      releaseA = state.acquireLightboxOpenState();
      releaseB = state.acquireLightboxOpenState();
    });

    expect(result.current).toBe(true);

    act(() => {
      releaseA();
    });

    expect(result.current).toBe(true);

    act(() => {
      releaseB();
      releaseB();
    });

    expect(result.current).toBe(false);
  });
});
