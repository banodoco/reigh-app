import { describe, expect, it } from 'vitest';
import {
  classifyRealtimeFetchError,
  toUserFriendlyRealtimeErrorMessage,
} from './errorPolicy';

describe('classifyRealtimeFetchError', () => {
  it('classifies connection closed errors', () => {
    expect(classifyRealtimeFetchError(new Error('ERR_CONNECTION_CLOSED'))).toBe('CONNECTION_CLOSED');
  });

  it('classifies network fetch errors', () => {
    expect(classifyRealtimeFetchError(new Error('Failed to fetch resource'))).toBe('NETWORK_ERROR');
  });

  it('classifies timeout errors', () => {
    expect(classifyRealtimeFetchError(new Error('Request timed out'))).toBe('TIMEOUT');
  });

  it('classifies abort errors', () => {
    expect(classifyRealtimeFetchError(new Error('AbortError: request aborted'))).toBe('ABORTED');
  });

  it('classifies auth errors', () => {
    expect(classifyRealtimeFetchError(new Error('401 unauthorized'))).toBe('AUTH_ERROR');
  });

  it('classifies rate limiting errors', () => {
    expect(classifyRealtimeFetchError(new Error('429 rate limit exceeded'))).toBe('RATE_LIMITED');
  });

  it('classifies service unavailability', () => {
    expect(classifyRealtimeFetchError(new Error('503 service unavailable'))).toBe('SERVICE_UNAVAILABLE');
  });

  it('falls back to unknown', () => {
    expect(classifyRealtimeFetchError(new Error('something else'))).toBe('UNKNOWN');
  });
});

describe('toUserFriendlyRealtimeErrorMessage', () => {
  it('maps known error types to stable user messages', () => {
    expect(toUserFriendlyRealtimeErrorMessage('CONNECTION_CLOSED', 1)).toBe('Connection issue detected');
    expect(toUserFriendlyRealtimeErrorMessage('NETWORK_ERROR', 2)).toBe('Connection issue detected');
    expect(toUserFriendlyRealtimeErrorMessage('TIMEOUT', 3)).toBe('Server is slow to respond');
    expect(toUserFriendlyRealtimeErrorMessage('RATE_LIMITED', 4)).toBe('Too many requests - slowing down');
    expect(toUserFriendlyRealtimeErrorMessage('SERVICE_UNAVAILABLE', 5)).toBe('Service temporarily unavailable');
    expect(toUserFriendlyRealtimeErrorMessage('AUTH_ERROR', 6)).toBe('Authentication issue - try refreshing');
  });

  it('includes failure count for unknown types', () => {
    expect(toUserFriendlyRealtimeErrorMessage('UNKNOWN', 7)).toBe('Connection issues (7 failures)');
  });
});
