import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock DataFreshnessManager
const mockGetPollingInterval = vi.fn().mockReturnValue(false);
const mockIsDataFresh = vi.fn().mockReturnValue(true);
const mockGetDiagnostics = vi.fn().mockReturnValue({
  realtimeStatus: 'connected',
  queryAges: [],
});
const mockSubscribe = vi.fn().mockReturnValue(() => {});

vi.mock('@/shared/realtime/DataFreshnessManager', () => ({
  dataFreshnessManager: {
    getPollingInterval: (...args: unknown[]) => mockGetPollingInterval(...args),
    isDataFresh: (...args: unknown[]) => mockIsDataFresh(...args),
    getDiagnostics: () => mockGetDiagnostics(),
    subscribe: (...args: unknown[]) => mockSubscribe(...args),
  },
}));

import { useSmartPollingConfig } from '../useSmartPolling';

describe('useSmartPollingConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to defaults
    mockGetPollingInterval.mockReturnValue(false);
    mockIsDataFresh.mockReturnValue(true);

    // Reset navigator.userAgent for mobile detection
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      configurable: true,
      writable: true,
    });
  });

  it('returns polling disabled when freshness manager says so and minInterval is false', () => {
    mockGetPollingInterval.mockReturnValue(false);

    const { result } = renderHook(() => useSmartPollingConfig(['test-key']));

    expect(result.current.refetchInterval).toBe(false);
  });

  it('clamps to maxInterval when polling interval is too low', () => {
    mockGetPollingInterval.mockReturnValue(1000); // 1 second - below max

    const { result } = renderHook(() => useSmartPollingConfig(['test-key']));

    // Default maxInterval is 15s
    expect(result.current.refetchInterval).toBe(15000);
  });

  it('uses freshness manager interval when within range', () => {
    mockGetPollingInterval.mockReturnValue(60000); // 60 seconds

    const { result } = renderHook(() => useSmartPollingConfig(['test-key']));

    expect(result.current.refetchInterval).toBe(60000);
  });

  it('returns staleTime 0 when data is not fresh', () => {
    mockIsDataFresh.mockReturnValue(false);
    mockGetPollingInterval.mockReturnValue(30000);

    const { result } = renderHook(() => useSmartPollingConfig(['test-key']));

    expect(result.current.staleTime).toBe(0);
  });

  it('returns freshnessThreshold as staleTime when data is fresh', () => {
    mockIsDataFresh.mockReturnValue(true);
    mockGetPollingInterval.mockReturnValue(false);

    const { result } = renderHook(() => useSmartPollingConfig(['test-key']));

    // Default freshnessThreshold is 30000
    expect(result.current.staleTime).toBe(30000);
  });

  it('subscribes to freshness manager on mount', () => {
    renderHook(() => useSmartPollingConfig(['test-key']));

    expect(mockSubscribe).toHaveBeenCalled();
  });

  it('unsubscribes on unmount', () => {
    const unsubscribeFn = vi.fn();
    mockSubscribe.mockReturnValue(unsubscribeFn);

    const { unmount } = renderHook(() => useSmartPollingConfig(['test-key']));
    unmount();

    expect(unsubscribeFn).toHaveBeenCalled();
  });
});
