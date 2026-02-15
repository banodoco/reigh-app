import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTimestampUpdater, useTimestampVisibility } from '../useTimestampUpdater';

describe('useTimestampUpdater', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial state with a valid date', () => {
    const { result } = renderHook(() =>
      useTimestampUpdater({ date: new Date() })
    );

    expect(result.current.updateTrigger).toBe(0);
    expect(result.current.date).toBeInstanceOf(Date);
    expect(result.current.currentInterval).toBeTypeOf('number');
  });

  it('returns null currentInterval when date is null', () => {
    const { result } = renderHook(() =>
      useTimestampUpdater({ date: null })
    );

    expect(result.current.date).toBeNull();
    expect(result.current.currentInterval).toBeNull();
  });

  it('accepts date strings', () => {
    const dateStr = '2025-01-15T12:00:00Z';
    const { result } = renderHook(() =>
      useTimestampUpdater({ date: dateStr })
    );

    expect(result.current.date).toBeInstanceOf(Date);
    expect(result.current.date?.toISOString()).toBe(new Date(dateStr).toISOString());
  });

  it('returns short interval for recent timestamps', () => {
    const recentDate = new Date(Date.now() - 60 * 1000); // 1 minute ago
    const { result } = renderHook(() =>
      useTimestampUpdater({ date: recentDate })
    );

    // Less than 5 minutes old → 10 second interval
    expect(result.current.currentInterval).toBe(10);
  });

  it('returns medium interval for older timestamps', () => {
    const olderDate = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
    const { result } = renderHook(() =>
      useTimestampUpdater({ date: olderDate })
    );

    // Less than 1 hour old → 60 second interval
    expect(result.current.currentInterval).toBe(60);
  });

  it('returns long interval for day-old timestamps', () => {
    const dayOld = new Date(Date.now() - 12 * 60 * 60 * 1000); // 12 hours ago
    const { result } = renderHook(() =>
      useTimestampUpdater({ date: dayOld })
    );

    // Less than 1 day old → 300 second interval
    expect(result.current.currentInterval).toBe(300);
  });

  it('returns longest interval for very old timestamps', () => {
    const veryOld = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
    const { result } = renderHook(() =>
      useTimestampUpdater({ date: veryOld })
    );

    // Older than 1 day → 1800 second interval
    expect(result.current.currentInterval).toBe(1800);
  });

  it('does not subscribe when disabled', () => {
    const { result } = renderHook(() =>
      useTimestampUpdater({ date: new Date(), disabled: true })
    );

    expect(result.current.updateTrigger).toBe(0);
  });

  it('does not subscribe when not visible', () => {
    const { result } = renderHook(() =>
      useTimestampUpdater({ date: new Date(), isVisible: false })
    );

    expect(result.current.updateTrigger).toBe(0);
  });
});

describe('useTimestampVisibility', () => {
  it('defaults to visible', () => {
    const ref = { current: null } as React.RefObject<HTMLElement>;
    const { result } = renderHook(() => useTimestampVisibility(ref));

    expect(result.current).toBe(true);
  });
});
