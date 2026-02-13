/**
 * DataFreshnessManager Tests
 *
 * Tests for the centralized data freshness and polling decision manager.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

vi.mock('@/shared/components/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Import the class constructor (not the singleton)
// We need to import the module to get the class
import { dataFreshnessManager } from '../DataFreshnessManager';

// Since the module exports a singleton, we'll use it directly but reset between tests

describe('DataFreshnessManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    dataFreshnessManager.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('starts in disconnected state', () => {
      const diagnostics = dataFreshnessManager.getDiagnostics();
      expect(diagnostics.realtimeStatus).toBe('disconnected');
      expect(diagnostics.trackedQueries).toBe(0);
    });

    it('reports data as not fresh when no events recorded', () => {
      expect(dataFreshnessManager.isDataFresh(['tasks', 'proj-1'])).toBe(false);
    });
  });

  describe('onRealtimeStatusChange', () => {
    it('updates status', () => {
      dataFreshnessManager.onRealtimeStatusChange('connected');
      const diagnostics = dataFreshnessManager.getDiagnostics();
      expect(diagnostics.realtimeStatus).toBe('connected');
    });

    it('ignores duplicate status changes', () => {
      const subscriber = vi.fn();
      dataFreshnessManager.subscribe(subscriber);

      dataFreshnessManager.onRealtimeStatusChange('connected');
      expect(subscriber).toHaveBeenCalledTimes(1);

      // Same status again - should be ignored
      dataFreshnessManager.onRealtimeStatusChange('connected');
      expect(subscriber).toHaveBeenCalledTimes(1);
    });

    it('notifies subscribers on status change', () => {
      const subscriber = vi.fn();
      dataFreshnessManager.subscribe(subscriber);

      dataFreshnessManager.onRealtimeStatusChange('connected');
      expect(subscriber).toHaveBeenCalledTimes(1);

      dataFreshnessManager.onRealtimeStatusChange('disconnected');
      expect(subscriber).toHaveBeenCalledTimes(2);
    });
  });

  describe('onRealtimeEvent', () => {
    it('records event times for affected queries', () => {
      dataFreshnessManager.onRealtimeEvent('INSERT', [
        ['tasks', 'proj-1'],
        ['generations', 'proj-1'],
      ]);

      expect(dataFreshnessManager.isDataFresh(['tasks', 'proj-1'])).toBe(true);
      expect(dataFreshnessManager.isDataFresh(['generations', 'proj-1'])).toBe(true);
      expect(dataFreshnessManager.isDataFresh(['shots', 'proj-1'])).toBe(false);
    });

    it('notifies subscribers', () => {
      const subscriber = vi.fn();
      dataFreshnessManager.subscribe(subscriber);

      dataFreshnessManager.onRealtimeEvent('INSERT', [['tasks', 'proj-1']]);
      expect(subscriber).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPollingInterval', () => {
    it('returns 15s polling when disconnected for less than 30s', () => {
      // Default state is disconnected
      const interval = dataFreshnessManager.getPollingInterval(['tasks', 'proj-1']);
      expect(interval).toBe(15_000);
    });

    it('returns 30s polling when disconnected for 30s-2min', () => {
      // Advance past 30s since initial state
      vi.advanceTimersByTime(35_000);
      const interval = dataFreshnessManager.getPollingInterval(['tasks', 'proj-1']);
      expect(interval).toBe(30_000);
    });

    it('returns 45s polling when disconnected for 2-5min', () => {
      vi.advanceTimersByTime(3 * 60_000);
      const interval = dataFreshnessManager.getPollingInterval(['tasks', 'proj-1']);
      expect(interval).toBe(45_000);
    });

    it('returns 60s polling when disconnected for >5min', () => {
      vi.advanceTimersByTime(6 * 60_000);
      const interval = dataFreshnessManager.getPollingInterval(['tasks', 'proj-1']);
      expect(interval).toBe(60_000);
    });

    it('returns 30s grace period polling when recently connected', () => {
      dataFreshnessManager.onRealtimeStatusChange('connected');
      const interval = dataFreshnessManager.getPollingInterval(['tasks', 'proj-1']);
      expect(interval).toBe(30_000);
    });

    it('disables polling when connected and has recent events', () => {
      dataFreshnessManager.onRealtimeStatusChange('connected');
      vi.advanceTimersByTime(35_000); // Past 30s grace period

      // Record a recent event
      dataFreshnessManager.onRealtimeEvent('INSERT', [['tasks', 'proj-1']]);

      const interval = dataFreshnessManager.getPollingInterval(['tasks', 'proj-1']);
      expect(interval).toBe(false);
    });

    it('uses safety net polling when connected >30s but no events and <5min', () => {
      dataFreshnessManager.onRealtimeStatusChange('connected');
      vi.advanceTimersByTime(60_000); // 1 minute stable

      const interval = dataFreshnessManager.getPollingInterval(['tasks', 'proj-1']);
      expect(interval).toBe(60_000);
    });

    it('disables polling when connected and stable for >5min', () => {
      dataFreshnessManager.onRealtimeStatusChange('connected');
      vi.advanceTimersByTime(6 * 60_000); // 6 minutes stable

      const interval = dataFreshnessManager.getPollingInterval(['tasks', 'proj-1']);
      expect(interval).toBe(false);
    });
  });

  describe('isDataFresh', () => {
    it('returns false for untracked queries', () => {
      expect(dataFreshnessManager.isDataFresh(['unknown'])).toBe(false);
    });

    it('returns true for recently recorded events', () => {
      dataFreshnessManager.onRealtimeEvent('INSERT', [['tasks', 'proj-1']]);
      expect(dataFreshnessManager.isDataFresh(['tasks', 'proj-1'])).toBe(true);
    });

    it('returns false for stale events', () => {
      dataFreshnessManager.onRealtimeEvent('INSERT', [['tasks', 'proj-1']]);
      vi.advanceTimersByTime(31_000); // Past default 30s threshold
      expect(dataFreshnessManager.isDataFresh(['tasks', 'proj-1'])).toBe(false);
    });

    it('respects custom freshness threshold', () => {
      dataFreshnessManager.onRealtimeEvent('INSERT', [['tasks', 'proj-1']]);
      vi.advanceTimersByTime(5_000);
      expect(dataFreshnessManager.isDataFresh(['tasks', 'proj-1'], 3000)).toBe(false);
      expect(dataFreshnessManager.isDataFresh(['tasks', 'proj-1'], 10000)).toBe(true);
    });
  });

  describe('fetch failure tracking (circuit breaker)', () => {
    it('tracks fetch failures', () => {
      const queryKey = ['tasks', 'proj-1'];
      dataFreshnessManager.onFetchFailure(queryKey, new Error('Failed to fetch'));
      dataFreshnessManager.onFetchFailure(queryKey, new Error('Failed to fetch'));

      // Below threshold - should not affect polling dramatically
      // (3 is the threshold)
    });

    it('triggers circuit breaker after 3 failures', () => {
      const queryKey = ['tasks', 'proj-1'];
      const subscriber = vi.fn();
      dataFreshnessManager.subscribe(subscriber);

      dataFreshnessManager.onFetchFailure(queryKey, new Error('Fail 1'));
      dataFreshnessManager.onFetchFailure(queryKey, new Error('Fail 2'));
      dataFreshnessManager.onFetchFailure(queryKey, new Error('Fail 3'));

      // Circuit breaker triggered - should have notified subscribers
      // The 3rd failure triggers the notification
      expect(subscriber).toHaveBeenCalled();
    });

    it('returns 60s polling when circuit breaker is active', () => {
      const queryKey = ['tasks', 'proj-1'];

      // Trigger circuit breaker
      dataFreshnessManager.onFetchFailure(queryKey, new Error('Fail 1'));
      dataFreshnessManager.onFetchFailure(queryKey, new Error('Fail 2'));
      dataFreshnessManager.onFetchFailure(queryKey, new Error('Fail 3'));

      const interval = dataFreshnessManager.getPollingInterval(queryKey);
      expect(interval).toBe(60_000);
    });

    it('resets circuit breaker on success', () => {
      const queryKey = ['tasks', 'proj-1'];

      // Trigger circuit breaker
      dataFreshnessManager.onFetchFailure(queryKey, new Error('Fail 1'));
      dataFreshnessManager.onFetchFailure(queryKey, new Error('Fail 2'));
      dataFreshnessManager.onFetchFailure(queryKey, new Error('Fail 3'));

      // Recovery
      dataFreshnessManager.onFetchSuccess(queryKey);

      // Should no longer be circuit-broken - back to normal disconnected polling
      const interval = dataFreshnessManager.getPollingInterval(queryKey);
      expect(interval).not.toBe(60_000);
    });

    it('shows recovery toast when circuit breaker resets', async () => {
      const { toast } = await import('@/shared/components/ui/sonner');
      const queryKey = ['tasks', 'proj-1'];

      dataFreshnessManager.onFetchFailure(queryKey, new Error('Fail 1'));
      dataFreshnessManager.onFetchFailure(queryKey, new Error('Fail 2'));
      dataFreshnessManager.onFetchFailure(queryKey, new Error('Fail 3'));

      dataFreshnessManager.onFetchSuccess(queryKey);

      expect(toast.success).toHaveBeenCalledWith('Connection restored', expect.any(Object));
    });
  });

  describe('subscribe', () => {
    it('returns unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = dataFreshnessManager.subscribe(callback);

      expect(typeof unsubscribe).toBe('function');

      dataFreshnessManager.onRealtimeStatusChange('connected');
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();
      dataFreshnessManager.onRealtimeStatusChange('disconnected');
      expect(callback).toHaveBeenCalledTimes(1); // Not called again
    });
  });

  describe('markQueriesFresh', () => {
    it('marks queries as fresh', () => {
      dataFreshnessManager.markQueriesFresh([
        ['tasks', 'proj-1'],
        ['generations', 'proj-1'],
      ]);

      expect(dataFreshnessManager.isDataFresh(['tasks', 'proj-1'])).toBe(true);
      expect(dataFreshnessManager.isDataFresh(['generations', 'proj-1'])).toBe(true);
    });

    it('notifies subscribers', () => {
      const subscriber = vi.fn();
      dataFreshnessManager.subscribe(subscriber);

      dataFreshnessManager.markQueriesFresh([['tasks', 'proj-1']]);
      expect(subscriber).toHaveBeenCalledTimes(1);
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      dataFreshnessManager.onRealtimeStatusChange('connected');
      dataFreshnessManager.onRealtimeEvent('INSERT', [['tasks', 'proj-1']]);

      dataFreshnessManager.reset();

      const diagnostics = dataFreshnessManager.getDiagnostics();
      expect(diagnostics.realtimeStatus).toBe('disconnected');
      expect(diagnostics.trackedQueries).toBe(0);
    });
  });

  describe('getDiagnostics', () => {
    it('returns diagnostic info', () => {
      dataFreshnessManager.onRealtimeStatusChange('connected');
      dataFreshnessManager.onRealtimeEvent('INSERT', [['tasks', 'proj-1']]);

      const diagnostics = dataFreshnessManager.getDiagnostics();

      expect(diagnostics.realtimeStatus).toBe('connected');
      expect(diagnostics.trackedQueries).toBe(1);
      expect(diagnostics.queryAges).toHaveLength(1);
      expect(diagnostics.queryAges[0].query).toEqual(['tasks', 'proj-1']);
      expect(typeof diagnostics.timestamp).toBe('number');
      expect(typeof diagnostics.subscriberCount).toBe('number');
    });
  });
});
