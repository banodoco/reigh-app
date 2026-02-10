/**
 * Standardized React Query configuration presets
 * 
 * USE THESE PRESETS FOR ALL NEW QUERIES to ensure consistent behavior.
 * 
 * IMPORTANT CONCEPTS:
 * - staleTime: How long data is considered "fresh" (no background refetch)
 * - gcTime: How long to keep unused data in cache before garbage collection
 * - refetchOnMount/WindowFocus/Reconnect: Automatic refetch triggers
 * 
 * Our architecture uses realtime subscriptions + mutation invalidation for
 * most data freshness. Avoid relying on automatic refetch triggers.
 */

import { UseQueryOptions } from '@tanstack/react-query';
import { isErrorWithCode, isErrorWithStatus, SUPABASE_ERROR } from '@/shared/lib/errorUtils';
import { dataFreshnessManager } from '@/shared/realtime/DataFreshnessManager';

/**
 * For queries backed by Supabase realtime subscriptions.
 * 
 * Data freshness comes from:
 * 1. Realtime events → invalidateQueries (via RealtimeProvider)
 * 2. Mutations → invalidateQueries (via useGenerationInvalidation)
 * 
 * NOT from:
 * - Auto-refetch on mount (causes cascading fetches)
 * - Auto-refetch on window focus (double-fetches with realtime)
 * 
 * USE FOR: generations, shot_generations, tasks, shots
 * 
 * @example
 * useQuery({
 *   queryKey: ['all-shot-generations', shotId],
 *   queryFn: fetchGenerations,
 *   ...QUERY_PRESETS.realtimeBacked,
 * })
 */
const REALTIME_BACKED_PRESET = {
  staleTime: 30_000, // 30 seconds - prevents rapid refetches
  gcTime: 5 * 60 * 1000, // 5 minutes
  refetchOnMount: false, // Realtime handles freshness
  refetchOnWindowFocus: false, // Realtime handles freshness
  refetchOnReconnect: true, // Safety net after network drops
} as const satisfies Partial<UseQueryOptions>;

/**
 * For mostly-static data that rarely changes.
 * 
 * Data freshness comes from:
 * 1. Initial fetch on mount
 * 2. Manual invalidation after relevant mutations
 * 
 * USE FOR: resources, presets, user settings, API tokens, tool settings
 * 
 * @example
 * useQuery({
 *   queryKey: ['resources', projectId],
 *   queryFn: fetchResources,
 *   ...QUERY_PRESETS.static,
 * })
 */
const STATIC_PRESET = {
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 15 * 60 * 1000, // 15 minutes
  refetchOnWindowFocus: false, // Don't refetch just because user tabbed back
} as const satisfies Partial<UseQueryOptions>;

/**
 * For truly immutable data that never changes once created.
 * 
 * USE FOR: completed task results, archived content, historical data
 * 
 * @example
 * useQuery({
 *   queryKey: ['task-result', taskId],
 *   queryFn: fetchTaskResult,
 *   ...QUERY_PRESETS.immutable,
 * })
 */
const IMMUTABLE_PRESET = {
  staleTime: Infinity, // Never stale
  gcTime: 30 * 60 * 1000, // 30 minutes (keep in cache longer)
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const satisfies Partial<UseQueryOptions>;

/**
 * For user-specific configuration data.
 * Similar to static but with slightly shorter cache times.
 * 
 * USE FOR: user preferences, account settings, subscription status
 * 
 * @example
 * useQuery({
 *   queryKey: ['user-settings'],
 *   queryFn: fetchUserSettings,
 *   ...QUERY_PRESETS.userConfig,
 * })
 */
const USER_CONFIG_PRESET = {
  staleTime: 2 * 60 * 1000, // 2 minutes
  gcTime: 10 * 60 * 1000, // 10 minutes
  refetchOnWindowFocus: false,
} as const satisfies Partial<UseQueryOptions>;

/**
 * All query presets as a single object for convenient imports.
 * 
 * @example
 * import { QUERY_PRESETS } from '@/shared/lib/queryDefaults';
 * 
 * useQuery({
 *   queryKey: ['my-query'],
 *   queryFn: myQueryFn,
 *   ...QUERY_PRESETS.realtimeBacked,
 * })
 */
export const QUERY_PRESETS = {
  /**
   * For queries backed by Supabase realtime (generations, tasks, shots)
   * - 30s staleTime, no auto-refetch on mount/focus
   */
  realtimeBacked: REALTIME_BACKED_PRESET,
  
  /**
   * For mostly-static data (resources, presets, settings)
   * - 5min staleTime, no refetch on focus
   */
  static: STATIC_PRESET,
  
  /**
   * For immutable data (completed tasks, historical data)
   * - Infinite staleTime, never refetches
   */
  immutable: IMMUTABLE_PRESET,
  
  /**
   * For user configuration (preferences, account settings)
   * - 2min staleTime, no refetch on focus
   */
  userConfig: USER_CONFIG_PRESET,
} as const;

/**
 * Type helper for extracting preset keys
 */
export type QueryPresetKey = keyof typeof QUERY_PRESETS;

/**
 * Classify an error to determine retry strategy
 */
export const classifyNetworkError = (error: Error): {
  type: 'transient' | 'client' | 'server' | 'auth' | 'abort';
  shouldRetry: boolean;
  maxRetries: number;
} => {
  const message = error?.message?.toLowerCase() || '';

  // Aborted/cancelled - never retry
  if (message.includes('abort') || message.includes('cancelled') || message.includes('request was cancelled')) {
    return { type: 'abort', shouldRetry: false, maxRetries: 0 };
  }

  // Auth errors - don't retry, needs re-auth
  if (message.includes('401') || message.includes('unauthorized') || message.includes('jwt')) {
    return { type: 'auth', shouldRetry: false, maxRetries: 0 };
  }

  // Client errors (4xx except auth) - don't retry
  if ((isErrorWithCode(error) && error.code === SUPABASE_ERROR.NOT_FOUND) ||
      message.includes('invalid') ||
      message.includes('not found') ||
      (isErrorWithStatus(error) && error.status !== undefined && error.status >= 400 && error.status < 500)) {
    return { type: 'client', shouldRetry: false, maxRetries: 0 };
  }

  // Transient network errors - retry aggressively
  if (message.includes('connection_closed') ||
      message.includes('err_connection_closed') ||
      message.includes('failed to fetch') ||
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('econnreset') ||
      message.includes('socket hang up')) {
    return { type: 'transient', shouldRetry: true, maxRetries: 4 }; // Up to 4 retries for network issues
  }

  // Server errors (5xx) - retry with caution
  if (message.includes('503') || message.includes('502') || message.includes('500') ||
      message.includes('service unavailable') ||
      (isErrorWithStatus(error) && error.status !== undefined && error.status >= 500)) {
    return { type: 'server', shouldRetry: true, maxRetries: 3 }; // Up to 3 retries for server errors
  }

  // Unknown errors - retry conservatively
  return { type: 'server', shouldRetry: true, maxRetries: 2 };
};

/**
 * Standard retry configuration for most queries.
 * Uses smart error classification to determine retry behavior.
 */
export const STANDARD_RETRY = (failureCount: number, error: Error) => {
  const classification = classifyNetworkError(error);

  if (!classification.shouldRetry) {
    return false;
  }

  // Log retry attempts for debugging

  return failureCount < classification.maxRetries;
};

/**
 * Standard retry delay with exponential backoff
 * - Transient errors: faster initial retry, then back off
 * - Server errors: slower to give server time to recover
 */
export const STANDARD_RETRY_DELAY = (attemptIndex: number, error?: Error) => {
  const classification = error ? classifyNetworkError(error) : { type: 'server' as const };

  // Base delays by error type
  const baseDelay = classification.type === 'transient' ? 500 : 1000;
  const maxDelay = classification.type === 'transient' ? 5000 : 10000;

  // Exponential backoff with jitter to prevent thundering herd
  const exponentialDelay = baseDelay * Math.pow(2, attemptIndex);
  const jitter = Math.random() * 500; // 0-500ms jitter

  return Math.min(exponentialDelay + jitter, maxDelay);
};

/**
 * Wraps a query function with circuit breaker tracking.
 * Reports successes and failures to DataFreshnessManager for smart polling decisions.
 *
 * @example
 * useQuery({
 *   queryKey: ['my-query', id],
 *   queryFn: withCircuitBreaker(['my-query', id], async () => {
 *     return await supabase.from('table').select('*');
 *   }),
 * })
 */
export function withCircuitBreaker<T>(
  queryKey: string[],
  queryFn: () => Promise<T>
): () => Promise<T> {
  return async () => {
    try {
      const result = await queryFn();
      dataFreshnessManager.onFetchSuccess(queryKey);
      return result;
    } catch (error) {
      dataFreshnessManager.onFetchFailure(queryKey, error as Error);
      throw error;
    }
  };
}

/**
 * Creates React Query options with circuit breaker integration.
 * Use this for queries that should participate in smart polling.
 *
 * @example
 * useQuery({
 *   queryKey: ['my-query', id],
 *   queryFn: myQueryFn,
 *   ...createQueryOptionsWithCircuitBreaker(['my-query', id]),
 * })
 */
export function createQueryOptionsWithCircuitBreaker(queryKey: string[]) {
  return {
    retry: STANDARD_RETRY,
    retryDelay: STANDARD_RETRY_DELAY,
    // Use meta to track the query key for error handling
    meta: {
      circuitBreakerKey: queryKey,
    },
  };
}
