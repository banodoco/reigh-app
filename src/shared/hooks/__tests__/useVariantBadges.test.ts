import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock calculateDerivedCountsSafe
const mockCalculateDerivedCountsSafe = vi.fn();

vi.mock('@/shared/lib/generationTransformers', () => ({
  calculateDerivedCountsSafe: (...args: unknown[]) => mockCalculateDerivedCountsSafe(...args),
}));

import { useVariantBadges } from '../useVariantBadges';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useVariantBadges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCalculateDerivedCountsSafe.mockResolvedValue({
      derivedCounts: { 'gen-1': 3, 'gen-2': 0 },
      hasUnviewedVariants: { 'gen-1': true, 'gen-2': false },
      unviewedVariantCounts: { 'gen-1': 2, 'gen-2': 0 },
    });
  });

  it('returns loading state initially', () => {
    const { result } = renderHook(
      () => useVariantBadges(['gen-1', 'gen-2']),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);
  });

  it('returns badge data after loading', async () => {
    const { result } = renderHook(
      () => useVariantBadges(['gen-1', 'gen-2']),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const badge1 = result.current.getBadgeData('gen-1');
    expect(badge1.derivedCount).toBe(3);
    expect(badge1.hasUnviewedVariants).toBe(true);
    expect(badge1.unviewedVariantCount).toBe(2);

    const badge2 = result.current.getBadgeData('gen-2');
    expect(badge2.derivedCount).toBe(0);
    expect(badge2.hasUnviewedVariants).toBe(false);
    expect(badge2.unviewedVariantCount).toBe(0);
  });

  it('returns zero values for unknown generation IDs', async () => {
    const { result } = renderHook(
      () => useVariantBadges(['gen-1']),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const badge = result.current.getBadgeData('unknown-gen');
    expect(badge.derivedCount).toBe(0);
    expect(badge.hasUnviewedVariants).toBe(false);
    expect(badge.unviewedVariantCount).toBe(0);
  });

  it('markGenerationViewed optimistically removes unviewed state', async () => {
    const { result } = renderHook(
      () => useVariantBadges(['gen-1']),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Before marking
    expect(result.current.getBadgeData('gen-1').hasUnviewedVariants).toBe(true);

    // Mark as viewed
    act(() => {
      result.current.markGenerationViewed('gen-1');
    });

    // After marking - optimistically updated
    expect(result.current.getBadgeData('gen-1').hasUnviewedVariants).toBe(false);
    expect(result.current.getBadgeData('gen-1').unviewedVariantCount).toBe(0);
    // derivedCount is not affected by viewing
    expect(result.current.getBadgeData('gen-1').derivedCount).toBe(3);
  });

  it('does not fetch when enabled=false', () => {
    renderHook(
      () => useVariantBadges(['gen-1'], false),
      { wrapper: createWrapper() }
    );

    expect(mockCalculateDerivedCountsSafe).not.toHaveBeenCalled();
  });

  it('does not fetch when generationIds is empty', () => {
    renderHook(
      () => useVariantBadges([]),
      { wrapper: createWrapper() }
    );

    expect(mockCalculateDerivedCountsSafe).not.toHaveBeenCalled();
  });

  it('passes correct IDs to calculateDerivedCountsSafe', async () => {
    const ids = ['gen-1', 'gen-2', 'gen-3'];

    renderHook(
      () => useVariantBadges(ids),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(mockCalculateDerivedCountsSafe).toHaveBeenCalledWith(ids);
    });
  });
});
