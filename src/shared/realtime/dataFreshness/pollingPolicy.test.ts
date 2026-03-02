import { describe, expect, it } from 'vitest';
import { getPollingIntervalForRealtimeState } from './pollingPolicy';

describe('getPollingIntervalForRealtimeState', () => {
  it('uses fast warm-up polling shortly after connected', () => {
    const interval = getPollingIntervalForRealtimeState({
      status: 'connected',
      lastStatusChangeAt: 1000,
      now: 20_000,
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 120_000,
    });

    expect(interval).toBe(30_000);
  });

  it('disables polling when connected with recent realtime events', () => {
    const interval = getPollingIntervalForRealtimeState({
      status: 'connected',
      lastStatusChangeAt: 0,
      lastEventAt: 350_000,
      now: 400_000,
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 120_000,
    });

    expect(interval).toBe(false);
  });

  it('returns 60s polling for connected state with stale/no events', () => {
    const staleEventInterval = getPollingIntervalForRealtimeState({
      status: 'connected',
      lastStatusChangeAt: 0,
      lastEventAt: 0,
      now: 250_000,
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 120_000,
    });
    const noEventInterval = getPollingIntervalForRealtimeState({
      status: 'connected',
      lastStatusChangeAt: 0,
      now: 200_000,
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 120_000,
    });

    expect(staleEventInterval).toBe(60_000);
    expect(noEventInterval).toBe(60_000);
  });

  it('backs off disconnected polling by outage duration and honors circuit breaker', () => {
    const immediate = getPollingIntervalForRealtimeState({
      status: 'disconnected',
      lastStatusChangeAt: 100_000,
      now: 120_000,
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 120_000,
    });
    const medium = getPollingIntervalForRealtimeState({
      status: 'disconnected',
      lastStatusChangeAt: 100_000,
      now: 170_000,
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 120_000,
    });
    const long = getPollingIntervalForRealtimeState({
      status: 'disconnected',
      lastStatusChangeAt: 100_000,
      now: 410_000,
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 120_000,
    });
    const tripped = getPollingIntervalForRealtimeState({
      status: 'error',
      lastStatusChangeAt: 100_000,
      now: 120_000,
      failureInfo: { count: 3, lastFailure: 119_500 },
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 120_000,
    });

    expect(immediate).toBe(15_000);
    expect(medium).toBe(30_000);
    expect(long).toBe(60_000);
    expect(tripped).toBe(60_000);
  });
});
