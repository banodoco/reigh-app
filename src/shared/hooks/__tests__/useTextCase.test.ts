import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/shared/hooks/usePersistentState', () => ({
  default: vi.fn((key: string, defaultVal: boolean) => {
    const { useState } = require('react');
    return useState(defaultVal);
  }),
}));

import { useTextCase } from '../useTextCase';

describe('useTextCase', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('preserve-user-text');
  });

  it('returns initial state with preserveUserText false', () => {
    const { result } = renderHook(() => useTextCase());
    expect(result.current.preserveUserText).toBe(false);
  });

  it('does not add class when preserveUserText is false', () => {
    renderHook(() => useTextCase());
    expect(document.documentElement.classList.contains('preserve-user-text')).toBe(false);
  });

  it('toggles preserveUserText and adds class', () => {
    const { result } = renderHook(() => useTextCase());
    act(() => {
      result.current.toggle();
    });
    expect(result.current.preserveUserText).toBe(true);
    expect(document.documentElement.classList.contains('preserve-user-text')).toBe(true);
  });

  it('removes class when toggled back', () => {
    const { result } = renderHook(() => useTextCase());
    act(() => {
      result.current.toggle();
    });
    act(() => {
      result.current.toggle();
    });
    expect(result.current.preserveUserText).toBe(false);
    expect(document.documentElement.classList.contains('preserve-user-text')).toBe(false);
  });

  it('exposes setPreserveUserText', () => {
    const { result } = renderHook(() => useTextCase());
    act(() => {
      result.current.setPreserveUserText(true);
    });
    expect(result.current.preserveUserText).toBe(true);
  });
});
