import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock useTimestampUpdater to avoid timer complexity
vi.mock('../useTimestampUpdater', () => ({
  useTimestampUpdater: vi.fn(({ date }: { date: Date | null }) => ({
    updateTrigger: 0,
    date,
    currentInterval: null,
  })),
}));

import { useRelativeTimestamp } from '../useUpdatingTimestamp';

describe('useProcessingTimestamp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when no date provided', () => {
    const { result } = renderHook(() => useRelativeTimestamp({ preset: 'processing' }));
    expect(result.current).toBeNull();
  });

  it('returns null for null date', () => {
    const { result } = renderHook(() =>
      useRelativeTimestamp({ date: null, preset: 'processing' })
    );
    expect(result.current).toBeNull();
  });

  it('returns "<1 min" for very recent timestamps', () => {
    const now = new Date('2025-01-15T12:00:00Z');
    vi.setSystemTime(now);

    const startedAt = new Date('2025-01-15T11:59:30Z'); // 30 seconds ago

    const { result } = renderHook(() =>
      useRelativeTimestamp({ date: startedAt, preset: 'processing' })
    );

    expect(result.current).toBe('Processing for <1 min');
  });

  it('shows minutes for 1-59 minutes', () => {
    const now = new Date('2025-01-15T12:00:00Z');
    vi.setSystemTime(now);

    const startedAt = new Date('2025-01-15T11:55:00Z'); // 5 minutes ago

    const { result } = renderHook(() =>
      useRelativeTimestamp({ date: startedAt, preset: 'processing' })
    );

    expect(result.current).toBe('Processing for 5 mins');
  });

  it('uses singular "min" for 1 minute', () => {
    const now = new Date('2025-01-15T12:00:00Z');
    vi.setSystemTime(now);

    const startedAt = new Date('2025-01-15T11:59:00Z'); // 1 minute ago

    const { result } = renderHook(() =>
      useRelativeTimestamp({ date: startedAt, preset: 'processing' })
    );

    expect(result.current).toBe('Processing for 1 min');
  });

  it('shows hours for longer durations', () => {
    const now = new Date('2025-01-15T14:00:00Z');
    vi.setSystemTime(now);

    const startedAt = new Date('2025-01-15T12:00:00Z'); // 2 hours ago

    const { result } = renderHook(() =>
      useRelativeTimestamp({ date: startedAt, preset: 'processing' })
    );

    expect(result.current).toBe('Processing for 2 hrs');
  });

  it('shows hours and minutes combined', () => {
    const now = new Date('2025-01-15T13:30:00Z');
    vi.setSystemTime(now);

    const startedAt = new Date('2025-01-15T12:00:00Z'); // 1 hr 30 min ago

    const { result } = renderHook(() =>
      useRelativeTimestamp({ date: startedAt, preset: 'processing' })
    );

    expect(result.current).toBe('Processing for 1 hr, 30 mins');
  });

  it('accepts string dates', () => {
    const now = new Date('2025-01-15T12:05:00Z');
    vi.setSystemTime(now);

    const { result } = renderHook(() =>
      useRelativeTimestamp({ date: '2025-01-15T12:00:00Z', preset: 'processing' })
    );

    expect(result.current).toBe('Processing for 5 mins');
  });

  it('returns null for invalid date string', () => {
    const { result } = renderHook(() =>
      useRelativeTimestamp({ date: 'not-a-date', preset: 'processing' })
    );

    expect(result.current).toBeNull();
  });
});

describe('useCompletedTimestamp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when no date provided', () => {
    const { result } = renderHook(() => useRelativeTimestamp({ preset: 'completed' }));
    expect(result.current).toBeNull();
  });

  it('returns "<1 min ago" for very recent completions', () => {
    const now = new Date('2025-01-15T12:00:00Z');
    vi.setSystemTime(now);

    const completedAt = new Date('2025-01-15T11:59:45Z'); // 15 seconds ago

    const { result } = renderHook(() =>
      useRelativeTimestamp({ date: completedAt, preset: 'completed' })
    );

    expect(result.current).toBe('Completed <1 min ago');
  });

  it('shows minutes for 1-59 minutes', () => {
    const now = new Date('2025-01-15T12:00:00Z');
    vi.setSystemTime(now);

    const completedAt = new Date('2025-01-15T11:50:00Z'); // 10 minutes ago

    const { result } = renderHook(() =>
      useRelativeTimestamp({ date: completedAt, preset: 'completed' })
    );

    expect(result.current).toBe('Completed 10 mins ago');
  });

  it('shows hours for longer completions', () => {
    const now = new Date('2025-01-15T15:00:00Z');
    vi.setSystemTime(now);

    const completedAt = new Date('2025-01-15T12:00:00Z'); // 3 hours ago

    const { result } = renderHook(() =>
      useRelativeTimestamp({ date: completedAt, preset: 'completed' })
    );

    expect(result.current).toBe('Completed 3 hrs ago');
  });

  it('shows days for older completions', () => {
    const now = new Date('2025-01-17T12:00:00Z');
    vi.setSystemTime(now);

    const completedAt = new Date('2025-01-15T12:00:00Z'); // 2 days ago

    const { result } = renderHook(() =>
      useRelativeTimestamp({ date: completedAt, preset: 'completed' })
    );

    expect(result.current).toBe('Completed 2 days ago');
  });
});
