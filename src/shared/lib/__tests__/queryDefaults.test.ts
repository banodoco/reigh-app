import { describe, it, expect } from 'vitest';
import { QUERY_PRESETS, STANDARD_RETRY, STANDARD_RETRY_DELAY } from '../query/queryDefaults';

describe('QUERY_PRESETS', () => {
  describe('realtimeBacked', () => {
    it('has 30 second staleTime', () => {
      expect(QUERY_PRESETS.realtimeBacked.staleTime).toBe(30_000);
    });

    it('does not refetch on mount or window focus', () => {
      expect(QUERY_PRESETS.realtimeBacked.refetchOnMount).toBe(false);
      expect(QUERY_PRESETS.realtimeBacked.refetchOnWindowFocus).toBe(false);
    });

    it('refetches on reconnect', () => {
      expect(QUERY_PRESETS.realtimeBacked.refetchOnReconnect).toBe(true);
    });
  });

  describe('static', () => {
    it('has 5 minute staleTime', () => {
      expect(QUERY_PRESETS.static.staleTime).toBe(5 * 60 * 1000);
    });

    it('does not refetch on window focus', () => {
      expect(QUERY_PRESETS.static.refetchOnWindowFocus).toBe(false);
    });
  });

  describe('immutable', () => {
    it('has infinite staleTime', () => {
      expect(QUERY_PRESETS.immutable.staleTime).toBe(Infinity);
    });

    it('never refetches', () => {
      expect(QUERY_PRESETS.immutable.refetchOnMount).toBe(false);
      expect(QUERY_PRESETS.immutable.refetchOnWindowFocus).toBe(false);
      expect(QUERY_PRESETS.immutable.refetchOnReconnect).toBe(false);
    });
  });

  describe('userConfig', () => {
    it('has 2 minute staleTime', () => {
      expect(QUERY_PRESETS.userConfig.staleTime).toBe(2 * 60 * 1000);
    });
  });
});

describe('STANDARD_RETRY', () => {
  it('does not retry abort errors', () => {
    const err = new Error('Request was cancelled');
    expect(STANDARD_RETRY(0, err)).toBe(false);
  });

  it('does not retry aborted errors', () => {
    const err = new Error('abort signal received');
    expect(STANDARD_RETRY(0, err)).toBe(false);
  });

  it('does not retry auth errors', () => {
    const err = new Error('401 Unauthorized');
    expect(STANDARD_RETRY(0, err)).toBe(false);
  });

  it('does not retry JWT errors', () => {
    const err = new Error('jwt expired');
    expect(STANDARD_RETRY(0, err)).toBe(false);
  });

  it('retries transient network errors', () => {
    const err = new Error('Failed to fetch');
    expect(STANDARD_RETRY(0, err)).toBe(true);
    expect(STANDARD_RETRY(3, err)).toBe(true);
  });

  it('stops retrying after max retries for network errors', () => {
    const err = new Error('Failed to fetch');
    expect(STANDARD_RETRY(4, err)).toBe(false);
  });

  it('retries server errors', () => {
    const err = new Error('503 Service Unavailable');
    expect(STANDARD_RETRY(0, err)).toBe(true);
    expect(STANDARD_RETRY(2, err)).toBe(true);
  });

  it('stops retrying server errors after max', () => {
    const err = new Error('503 Service Unavailable');
    expect(STANDARD_RETRY(3, err)).toBe(false);
  });

  it('retries connection closed errors', () => {
    const err = new Error('connection_closed');
    expect(STANDARD_RETRY(0, err)).toBe(true);
  });

  it('retries unknown errors conservatively', () => {
    const err = new Error('something unexpected');
    expect(STANDARD_RETRY(0, err)).toBe(true);
    expect(STANDARD_RETRY(1, err)).toBe(true);
    expect(STANDARD_RETRY(2, err)).toBe(false);
  });
});

describe('STANDARD_RETRY_DELAY', () => {
  it('returns a number', () => {
    const delay = STANDARD_RETRY_DELAY(0);
    expect(typeof delay).toBe('number');
    expect(delay).toBeGreaterThan(0);
  });

  it('uses shorter base delay for transient errors', () => {
    const transientErr = new Error('Failed to fetch');
    const serverErr = new Error('500 Internal Server Error');

    // With jitter, we can't get exact values, but transient base is 500ms vs server 1000ms
    // At attempt 0: transient = 500 + jitter, server = 1000 + jitter
    // Run multiple times and check the range
    const transientDelays: number[] = [];
    const serverDelays: number[] = [];
    for (let i = 0; i < 20; i++) {
      transientDelays.push(STANDARD_RETRY_DELAY(0, transientErr));
      serverDelays.push(STANDARD_RETRY_DELAY(0, serverErr));
    }

    const avgTransient = transientDelays.reduce((a, b) => a + b, 0) / transientDelays.length;
    const avgServer = serverDelays.reduce((a, b) => a + b, 0) / serverDelays.length;

    // Transient should average lower than server
    expect(avgTransient).toBeLessThan(avgServer);
  });

  it('increases with attempt index (exponential backoff)', () => {
    const err = new Error('500 server error');
    // Attempt 0: base * 2^0 = 1000 + jitter
    // Attempt 2: base * 2^2 = 4000 + jitter
    // Multiple samples to average out jitter
    const attempt0Delays: number[] = [];
    const attempt2Delays: number[] = [];
    for (let i = 0; i < 20; i++) {
      attempt0Delays.push(STANDARD_RETRY_DELAY(0, err));
      attempt2Delays.push(STANDARD_RETRY_DELAY(2, err));
    }

    const avg0 = attempt0Delays.reduce((a, b) => a + b, 0) / attempt0Delays.length;
    const avg2 = attempt2Delays.reduce((a, b) => a + b, 0) / attempt2Delays.length;

    expect(avg2).toBeGreaterThan(avg0);
  });

  it('caps delay at max', () => {
    // At very high attempt index, delay should be capped
    const delay = STANDARD_RETRY_DELAY(10, new Error('server error'));
    expect(delay).toBeLessThanOrEqual(10500); // maxDelay=10000 + jitter=500
  });
});
