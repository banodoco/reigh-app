import { describe, expect, it } from 'vitest';

import {
  classifyRealtimeFetchError,
  toUserFriendlyRealtimeErrorMessage,
} from '../errorPolicy';
import { getPollingIntervalForRealtimeState } from '../pollingPolicy';

describe('errorPolicy', () => {
  it('classifies known realtime fetch error patterns', () => {
    expect(classifyRealtimeFetchError(new Error('ERR_CONNECTION_CLOSED'))).toBe('CONNECTION_CLOSED');
    expect(classifyRealtimeFetchError(new Error('Failed to fetch resource'))).toBe('NETWORK_ERROR');
    expect(classifyRealtimeFetchError(new Error('Request timed out'))).toBe('TIMEOUT');
    expect(classifyRealtimeFetchError(new Error('The operation was aborted'))).toBe('ABORTED');
    expect(classifyRealtimeFetchError(new Error('401 unauthorized'))).toBe('AUTH_ERROR');
    expect(classifyRealtimeFetchError(new Error('429 rate limit'))).toBe('RATE_LIMITED');
    expect(classifyRealtimeFetchError(new Error('503 service unavailable'))).toBe('SERVICE_UNAVAILABLE');
    expect(classifyRealtimeFetchError(new Error('something else'))).toBe('UNKNOWN');
  });

  it('maps error type to user-facing message', () => {
    expect(toUserFriendlyRealtimeErrorMessage('NETWORK_ERROR', 2)).toBe('Connection issue detected');
    expect(toUserFriendlyRealtimeErrorMessage('TIMEOUT', 3)).toBe('Server is slow to respond');
    expect(toUserFriendlyRealtimeErrorMessage('RATE_LIMITED', 4)).toBe('Too many requests - slowing down');
    expect(toUserFriendlyRealtimeErrorMessage('UNKNOWN', 5)).toBe('Connection issues (5 failures)');
  });
});

describe('pollingPolicy', () => {
  const now = 1_000_000;

  it('disables polling when recently connected with recent events', () => {
    const interval = getPollingIntervalForRealtimeState({
      status: 'connected',
      now,
      lastStatusChangeAt: now - 45_000,
      lastEventAt: now - 30_000,
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 60_000,
    });

    expect(interval).toBe(false);
  });

  it('uses aggressive polling during initial disconnect window', () => {
    const interval = getPollingIntervalForRealtimeState({
      status: 'disconnected',
      now,
      lastStatusChangeAt: now - 10_000,
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 60_000,
    });

    expect(interval).toBe(15_000);
  });

  it('backs off polling when circuit breaker threshold is hit', () => {
    const interval = getPollingIntervalForRealtimeState({
      status: 'error',
      now,
      lastStatusChangeAt: now - 10_000,
      failureInfo: { count: 3, lastFailure: now - 1_000 },
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 60_000,
    });

    expect(interval).toBe(60_000);
  });
});
