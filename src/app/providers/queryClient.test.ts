import { describe, expect, it } from 'vitest';
import { queryClient } from './queryClient';

describe('queryClient defaults', () => {
  it('applies query retry policy and backoff limits', () => {
    const queryDefaults = queryClient.getDefaultOptions().queries;
    const retry = queryDefaults?.retry as (count: number, error: Error) => boolean;
    const retryDelay = queryDefaults?.retryDelay as (index: number) => number;

    expect(retry(0, new Error('temporary'))).toBe(true);
    expect(retry(2, new Error('temporary'))).toBe(false);
    expect(retry(0, new Error('unauthorized request'))).toBe(false);
    expect(retry(0, new Error('forbidden operation'))).toBe(false);
    expect(retryDelay(0)).toBe(1000);
    expect(retryDelay(2)).toBe(3000);
    expect(retryDelay(5)).toBe(3000);
    expect(queryDefaults?.staleTime).toBe(5 * 60 * 1000);
  });

  it('applies mutation retry policy and fixed delay', () => {
    const mutationDefaults = queryClient.getDefaultOptions().mutations;
    const retry = mutationDefaults?.retry as (count: number, error: Error) => boolean;

    expect(retry(0, new Error('temporary'))).toBe(true);
    expect(retry(1, new Error('temporary'))).toBe(false);
    expect(retry(0, new Error('unauthorized request'))).toBe(false);
    expect(retry(0, new Error('forbidden operation'))).toBe(false);
    expect(mutationDefaults?.retryDelay).toBe(1500);
  });
});
