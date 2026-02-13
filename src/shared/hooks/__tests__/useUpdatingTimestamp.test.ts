import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/shared/hooks/useTimestampUpdater', () => ({
  useTimestampUpdater: vi.fn(() => ({
    updateTrigger: 0,
    date: null,
    currentInterval: null,
  })),
}));

import { useUpdatingTimestamp, useTaskTimestamp } from '../useUpdatingTimestamp';

describe('useUpdatingTimestamp', () => {
  it('returns "Unknown" when no date provided', () => {
    const { result } = renderHook(() => useUpdatingTimestamp({}));
    expect(result.current).toBe('Unknown');
  });

  it('returns "Unknown" when date is null', () => {
    const { result } = renderHook(() => useUpdatingTimestamp({ date: null }));
    expect(result.current).toBe('Unknown');
  });

  it('returns formatted string for valid date', () => {
    const date = new Date(Date.now() - 30 * 1000).toISOString(); // 30 seconds ago
    const { result } = renderHook(() => useUpdatingTimestamp({ date }));
    expect(result.current).toBeTruthy();
    expect(result.current).not.toBe('Unknown');
  });

  it('abbreviates "less than a minute" to "<1 min ago"', () => {
    const date = new Date(Date.now() - 5 * 1000).toISOString(); // 5 seconds ago
    const { result } = renderHook(() => useUpdatingTimestamp({ date }));
    expect(result.current).toBe('<1 min ago');
  });

  it('uses custom abbreviation function', () => {
    const date = new Date(Date.now() - 5 * 1000).toISOString();
    const customAbbreviate = (str: string) => `custom: ${str}`;
    const { result } = renderHook(() =>
      useUpdatingTimestamp({ date, abbreviate: customAbbreviate })
    );
    expect(result.current).toContain('custom:');
  });
});

describe('useTaskTimestamp', () => {
  it('returns formatted string for valid date', () => {
    const date = new Date(Date.now() - 5 * 1000).toISOString();
    const { result } = renderHook(() => useTaskTimestamp(date));
    expect(result.current).toBeTruthy();
  });

  it('returns "Unknown" for null date', () => {
    const { result } = renderHook(() => useTaskTimestamp(null));
    expect(result.current).toBe('Unknown');
  });
});
