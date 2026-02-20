/**
 * DataFreshnessManager - Single source of truth for data freshness and polling decisions
 *
 * This class centralizes all decisions about:
 * - Whether data is fresh (based on realtime events)
 * - What polling intervals React Query should use
 * - Realtime connection health status
 */

import { handleError } from '@/shared/lib/errorHandling/handleError';
import { toast } from '@/shared/components/ui/sonner';

type RealtimeStatus = 'connected' | 'disconnected' | 'error';
type PollingInterval = number | false; // false = no polling
type QueryKeyLike = readonly unknown[];

interface DataFreshnessState {
  realtimeStatus: RealtimeStatus;
  lastEventTimes: Map<string, number>;
  lastStatusChange: number;
  /** Track consecutive fetch failures per query for circuit breaker */
  fetchFailures: Map<string, { count: number; lastFailure: number }>;
}

class DataFreshnessManager {
  private state: DataFreshnessState = {
    realtimeStatus: 'disconnected',
    lastEventTimes: new Map(),
    lastStatusChange: Date.now(),
    fetchFailures: new Map()
  };

  private subscribers = new Set<() => void>();

  // Circuit breaker settings
  private readonly CIRCUIT_BREAKER_THRESHOLD = 3; // failures before backing off
  private readonly CIRCUIT_BREAKER_RESET_MS = 60_000; // 1 minute to reset failure count

  // Toast throttling - prevent spamming error toasts
  private lastErrorToastTime = 0;
  private readonly ERROR_TOAST_THROTTLE_MS = 30_000; // Only show error toast every 30 seconds

  private parseQueryKey(rawKey: string): unknown {
    try {
      return JSON.parse(rawKey);
    } catch {
      return rawKey;
    }
  }

  /**
   * Report realtime connection status change
   */
  onRealtimeStatusChange(status: RealtimeStatus, _reason?: string) {
    const previousStatus = this.state.realtimeStatus;
    const now = Date.now();

    // 🎯 KEY FIX: Ignore duplicate status changes to keep lastStatusChange stable
    // This allows the "recently connected" grace period in getPollingInterval to actually expire
    if (previousStatus === status) {
      return; // Don't update state or notify subscribers for duplicates
    }
    
    // Actual status transition - update state
    this.state.realtimeStatus = status;
    this.state.lastStatusChange = now;

    // Notify all subscribers that polling intervals may have changed
    this.notifySubscribers();
  }

  /**
   * Report that realtime events were received for specific queries
   */
  onRealtimeEvent(_eventType: string, affectedQueries: readonly QueryKeyLike[]) {
    const now = Date.now();

    affectedQueries.forEach(queryKey => {
      const key = JSON.stringify(queryKey);
      this.state.lastEventTimes.set(key, now);
    });

    // Notify subscribers that data freshness has changed
    this.notifySubscribers();
  }

  /**
   * Get the appropriate polling interval for a query
   * Returns false to disable polling when realtime is working well
   */
  getPollingInterval(queryKey: QueryKeyLike): PollingInterval {
    const key = JSON.stringify(queryKey);
    const lastEvent = this.state.lastEventTimes.get(key);
    const now = Date.now();
    const timeSinceStatusChange = now - this.state.lastStatusChange;

    // 🎯 If realtime is connected, trust it after it's been stable
    if (this.state.realtimeStatus === 'connected') {
      // If realtime just connected (< 30 seconds), give it time to prove it's stable
      if (timeSinceStatusChange < 30000) {
        return 30000; // 30 seconds - wait for realtime to prove it's stable
      }

      // ✅ FIXED: If realtime has been stable for >30 seconds, trust it
      // "No events" just means "nothing changed" - not "realtime is broken"
      
      if (lastEvent) {
        const eventAge = now - lastEvent;
        
        if (eventAge < 60000) { // Events within 1 minute
          return false; // ✨ DISABLE POLLING - realtime is working!
        } else if (eventAge < 3 * 60 * 1000) { // Events within 3 minutes
          return 60000; // 60 seconds - light backup polling
        }
      }

      // ✅ KEY FIX: Realtime stable for >30s but no events
      // This is NORMAL when idle - don't assume it's broken
      // Use very light polling as safety net only
      if (timeSinceStatusChange > 5 * 60 * 1000) {
        // Realtime been stable for >5 minutes - fully trust it
        return false; // ✨ DISABLE POLLING - realtime is stable, idle is OK
      } else {
        // Realtime stable for 30s-5min - use safety net polling
        return 60000; // 60 seconds - safety net while realtime proves long-term stability
      }
    }

    // If realtime is disconnected or errored, use GRADUATED backoff polling
    // to prevent thundering herd and connection overload
    const disconnectedDuration = now - this.state.lastStatusChange;

    // Check circuit breaker - if this query has had many failures, back off more
    const failureInfo = this.state.fetchFailures.get(key);
    const hasRecentFailures = failureInfo &&
      (now - failureInfo.lastFailure) < this.CIRCUIT_BREAKER_RESET_MS &&
      failureInfo.count >= this.CIRCUIT_BREAKER_THRESHOLD;

    let pollingInterval: number;

    if (hasRecentFailures) {
      // Circuit breaker triggered - use much longer interval
      pollingInterval = 60_000; // 60 seconds
    } else if (disconnectedDuration < 30_000) {
      // First 30 seconds: 15s polling (give realtime time to reconnect)
      pollingInterval = 15_000;
    } else if (disconnectedDuration < 2 * 60_000) {
      // 30s - 2 minutes: 30s polling
      pollingInterval = 30_000;
    } else if (disconnectedDuration < 5 * 60_000) {
      // 2-5 minutes: 45s polling
      pollingInterval = 45_000;
    } else {
      // >5 minutes: 60s polling (realtime probably has issues)
      pollingInterval = 60_000;
    }

    return pollingInterval;
  }

  /**
   * Report a fetch failure for circuit breaker tracking
   */
  onFetchFailure(queryKey: QueryKeyLike, error: Error) {
    const key = JSON.stringify(queryKey);
    const now = Date.now();
    const existing = this.state.fetchFailures.get(key);

    // Reset count if last failure was too long ago
    const shouldReset = existing && (now - existing.lastFailure) > this.CIRCUIT_BREAKER_RESET_MS;

    const newCount = shouldReset ? 1 : (existing?.count || 0) + 1;
    this.state.fetchFailures.set(key, { count: newCount, lastFailure: now });

    const isCircuitBreakerTriggered = newCount >= this.CIRCUIT_BREAKER_THRESHOLD;

    const errorType = this.classifyError(error);

    // Notify subscribers so polling intervals can adjust
    if (isCircuitBreakerTriggered) {
      this.notifySubscribers();

      // Show user-facing error toast (throttled to prevent spam)
      if (now - this.lastErrorToastTime > this.ERROR_TOAST_THROTTLE_MS) {
        this.lastErrorToastTime = now;

        // Customize message based on error type
        const userMessage = this.getUserFriendlyErrorMessage(errorType, newCount);
        toast.error(userMessage, {
          duration: 8000,
          description: 'Data may be outdated. Will retry automatically.',
          id: 'network-error-toast', // Prevent duplicate toasts
        });
      }
    }
  }

  /**
   * Get a user-friendly error message based on error type
   */
  private getUserFriendlyErrorMessage(errorType: string, failureCount: number): string {
    switch (errorType) {
      case 'CONNECTION_CLOSED':
      case 'NETWORK_ERROR':
        return 'Connection issue detected';
      case 'TIMEOUT':
        return 'Server is slow to respond';
      case 'RATE_LIMITED':
        return 'Too many requests - slowing down';
      case 'SERVICE_UNAVAILABLE':
        return 'Service temporarily unavailable';
      case 'AUTH_ERROR':
        return 'Authentication issue - try refreshing';
      default:
        return `Connection issues (${failureCount} failures)`;
    }
  }

  /**
   * Report a successful fetch (resets circuit breaker)
   */
  onFetchSuccess(queryKey: QueryKeyLike) {
    const key = JSON.stringify(queryKey);
    const existing = this.state.fetchFailures.get(key);

    if (existing && existing.count > 0) {
      const wasCircuitBreakerActive = existing.count >= this.CIRCUIT_BREAKER_THRESHOLD;

      // Reset failure count on success
      this.state.fetchFailures.delete(key);

      // Show recovery toast if circuit breaker was active
      if (wasCircuitBreakerActive) {
        toast.success('Connection restored', {
          duration: 3000,
          id: 'network-recovery-toast',
        });
      }
    }
  }

  /**
   * Classify error type for better logging and handling
   */
  private classifyError(error: Error): string {
    const message = error.message?.toLowerCase() || '';

    if (message.includes('connection_closed') || message.includes('err_connection_closed')) {
      return 'CONNECTION_CLOSED';
    }
    if (message.includes('failed to fetch') || message.includes('network')) {
      return 'NETWORK_ERROR';
    }
    if (message.includes('timeout') || message.includes('timed out')) {
      return 'TIMEOUT';
    }
    if (message.includes('abort')) {
      return 'ABORTED';
    }
    if (message.includes('401') || message.includes('unauthorized')) {
      return 'AUTH_ERROR';
    }
    if (message.includes('429') || message.includes('rate limit')) {
      return 'RATE_LIMITED';
    }
    if (message.includes('503') || message.includes('service unavailable')) {
      return 'SERVICE_UNAVAILABLE';
    }
    return 'UNKNOWN';
  }

  /**
   * Check if data for a query is considered fresh
   */
  isDataFresh(queryKey: QueryKeyLike, freshnessThreshold: number = 30000): boolean {
    const key = JSON.stringify(queryKey);
    const lastEvent = this.state.lastEventTimes.get(key);
    
    if (!lastEvent) {
      return false; // No events recorded = not fresh
    }
    
    const age = Date.now() - lastEvent;
    return age < freshnessThreshold;
  }

  /**
   * Get current freshness state for debugging
   */
  getDiagnostics() {
    const now = Date.now();
    return {
      realtimeStatus: this.state.realtimeStatus,
      timeSinceStatusChange: now - this.state.lastStatusChange,
      trackedQueries: this.state.lastEventTimes.size,
      queryAges: Array.from(this.state.lastEventTimes.entries()).map(([key, time]) => {
        return {
          query: this.parseQueryKey(key),
          ageMs: now - time,
          ageSec: Math.round((now - time) / 1000)
        };
      }),
      subscriberCount: this.subscribers.size,
      timestamp: now
    };
  }

  /**
   * Subscribe to freshness changes
   * Returns unsubscribe function
   */
  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Clear all event history (useful for testing or project changes)
   */
  reset() {
    this.state.lastEventTimes.clear();
    this.state.fetchFailures.clear();
    this.state.realtimeStatus = 'disconnected';
    this.state.lastStatusChange = Date.now();
    this.notifySubscribers();
  }

  /**
   * Manually mark queries as fresh (useful for mutations)
   */
  markQueriesFresh(queryKeys: readonly QueryKeyLike[]) {
    const now = Date.now();
    queryKeys.forEach(queryKey => {
      const key = JSON.stringify(queryKey);
      this.state.lastEventTimes.set(key, now);
    });

    this.notifySubscribers();
  }

  private notifySubscribers() {
    // Notify all React components that polling intervals may have changed
    this.subscribers.forEach(callback => {
      try {
        callback();
      } catch (error) {
        handleError(error, { context: 'DataFreshnessManager', showToast: false });
      }
    });
  }
}

// Singleton instance - single source of truth for the entire app
export const dataFreshnessManager = new DataFreshnessManager();

// Export for debugging in browser console (dev only)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__DATA_FRESHNESS_MANAGER__ = dataFreshnessManager;
}
