import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useTimestampUpdaterMock } = vi.hoisted(() => ({
  useTimestampUpdaterMock: vi.fn(),
}));

vi.mock('../useTimestampUpdater', () => ({
  useTimestampUpdater: (...args: unknown[]) => useTimestampUpdaterMock(...args),
}));

import { useLiveRelativeTimestamp } from '../useLiveRelativeTimestamp';

describe('useLiveRelativeTimestamp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTimestampUpdaterMock.mockReturnValue({
      updateTrigger: 0,
      date: null,
      currentInterval: null,
    });
  });

  it('returns null for invalid date strings', () => {
    const formatter = vi.fn((date: Date) => date.toISOString());
    const { result } = renderHook(() =>
      useLiveRelativeTimestamp({
        dateInput: 'invalid-date-value',
        disabled: false,
        formatter,
      })
    );

    expect(result.current).toBeNull();
    expect(formatter).not.toHaveBeenCalled();
    expect(useTimestampUpdaterMock).toHaveBeenCalledWith({
      date: null,
      disabled: false,
      isVisible: true,
    });
  });

  it('returns null when dateInput is missing', () => {
    const formatter = vi.fn((date: Date) => date.toISOString());
    const { result } = renderHook(() =>
      useLiveRelativeTimestamp({
        dateInput: null,
        disabled: false,
        formatter,
      })
    );

    expect(result.current).toBeNull();
    expect(formatter).not.toHaveBeenCalled();
  });

  it('formats valid dates and tracks updater dependencies', () => {
    const formatter = vi.fn((date: Date) => `formatted:${date.toISOString()}`);
    const dateInput = '2026-02-22T12:00:00.000Z';

    const { result } = renderHook(() =>
      useLiveRelativeTimestamp({
        dateInput,
        disabled: false,
        formatter,
      })
    );

    expect(result.current).toBe('formatted:2026-02-22T12:00:00.000Z');
    expect(formatter).toHaveBeenCalledTimes(1);
    expect(useTimestampUpdaterMock).toHaveBeenCalledWith({
      date: new Date(dateInput),
      disabled: false,
      isVisible: true,
    });
  });

  it('recomputes when updateTrigger changes', () => {
    const formatter = vi.fn((date: Date) => `tick:${date.toISOString()}`);
    const dateInput = '2026-02-22T12:00:00.000Z';

    useTimestampUpdaterMock.mockReturnValueOnce({
      updateTrigger: 0,
      date: null,
      currentInterval: null,
    });

    const { rerender } = renderHook(
      ({ trigger }: { trigger: number }) => {
        useTimestampUpdaterMock.mockReturnValue({
          updateTrigger: trigger,
          date: null,
          currentInterval: null,
        });
        return useLiveRelativeTimestamp({
          dateInput,
          disabled: false,
          formatter,
        });
      },
      { initialProps: { trigger: 0 } }
    );

    expect(formatter).toHaveBeenCalledTimes(1);
    rerender({ trigger: 1 });
    expect(formatter).toHaveBeenCalledTimes(2);
  });

  it('passes disabled=true through to timestamp updater', () => {
    const formatter = vi.fn((date: Date) => date.toISOString());
    const dateInput = '2026-02-22T12:00:00.000Z';

    renderHook(() =>
      useLiveRelativeTimestamp({
        dateInput,
        disabled: true,
        formatter,
      })
    );

    expect(useTimestampUpdaterMock).toHaveBeenCalledWith({
      date: new Date(dateInput),
      disabled: true,
      isVisible: true,
    });
  });
});
