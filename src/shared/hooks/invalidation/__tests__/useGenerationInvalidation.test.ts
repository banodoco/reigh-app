import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useInvalidateGenerations,
  invalidateGenerationsSync,
  invalidateAllShotGenerations,
  invalidateVariantChange,
} from '../useGenerationInvalidation';
import { queryKeys } from '@/shared/lib/queryKeys';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

describe('useInvalidateGenerations', () => {
  it('returns a stable function', () => {
    const { wrapper } = createWrapper();
    const { result, rerender } = renderHook(() => useInvalidateGenerations(), { wrapper });

    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe('invalidateGenerationsSync', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
  });

  it('invalidates byShot and liveTimeline for images scope', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const shotId = 'shot-123';

    invalidateGenerationsSync(queryClient, shotId, {
      reason: 'test',
      scope: 'images',
    });

    const calls = invalidateSpy.mock.calls.map(c => c[0]);
    const queryKeysUsed = calls.map(c => (c as { queryKey: unknown }).queryKey);

    expect(queryKeysUsed).toContainEqual(queryKeys.generations.byShot(shotId));
    expect(queryKeysUsed).toContainEqual(queryKeys.segments.liveTimeline(shotId));
  });

  it('invalidates metadata for metadata scope', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const shotId = 'shot-123';

    invalidateGenerationsSync(queryClient, shotId, {
      reason: 'test',
      scope: 'metadata',
    });

    const calls = invalidateSpy.mock.calls.map(c => c[0]);
    const queryKeysUsed = calls.map(c => (c as { queryKey: unknown }).queryKey);

    expect(queryKeysUsed).toContainEqual(queryKeys.generations.meta(shotId));
  });

  it('invalidates unpositioned count for counts scope', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const shotId = 'shot-123';

    invalidateGenerationsSync(queryClient, shotId, {
      reason: 'test',
      scope: 'counts',
    });

    const calls = invalidateSpy.mock.calls.map(c => c[0]);
    const queryKeysUsed = calls.map(c => (c as { queryKey: unknown }).queryKey);

    expect(queryKeysUsed).toContainEqual(queryKeys.generations.unpositionedCount(shotId));
  });

  it('invalidates all query types for all scope', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const shotId = 'shot-123';

    invalidateGenerationsSync(queryClient, shotId, {
      reason: 'test',
      scope: 'all',
    });

    const calls = invalidateSpy.mock.calls.map(c => c[0]);
    const queryKeysUsed = calls.map(c => (c as { queryKey: unknown }).queryKey).filter(Boolean);

    expect(queryKeysUsed).toContainEqual(queryKeys.generations.byShot(shotId));
    expect(queryKeysUsed).toContainEqual(queryKeys.segments.liveTimeline(shotId));
    expect(queryKeysUsed).toContainEqual(queryKeys.generations.meta(shotId));
    expect(queryKeysUsed).toContainEqual(queryKeys.generations.unpositionedCount(shotId));
  });

  it('defaults to all scope when scope not specified', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const shotId = 'shot-123';

    invalidateGenerationsSync(queryClient, shotId, {
      reason: 'test',
    });

    // Should invalidate byShot (images scope), meta (metadata scope), and count (counts scope)
    expect(invalidateSpy.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('includes shots invalidation when includeShots is true', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const shotId = 'shot-123';
    const projectId = 'project-123';

    invalidateGenerationsSync(queryClient, shotId, {
      reason: 'test',
      includeShots: true,
      projectId,
    });

    const calls = invalidateSpy.mock.calls.map(c => c[0]);
    const queryKeysUsed = calls.map(c => (c as { queryKey: unknown }).queryKey).filter(Boolean);

    expect(queryKeysUsed).toContainEqual(queryKeys.shots.list(projectId));
  });

  it('includes project unified invalidation when includeProjectUnified is true', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const shotId = 'shot-123';
    const projectId = 'project-123';

    invalidateGenerationsSync(queryClient, shotId, {
      reason: 'test',
      includeProjectUnified: true,
      projectId,
    });

    const calls = invalidateSpy.mock.calls.map(c => c[0]);
    const queryKeysUsed = calls.map(c => (c as { queryKey: unknown }).queryKey).filter(Boolean);

    expect(queryKeysUsed).toContainEqual(queryKeys.unified.projectPrefix(projectId));
  });

  it('delays invalidation when delayMs is specified', () => {
    vi.useFakeTimers();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    invalidateGenerationsSync(queryClient, 'shot-123', {
      reason: 'test',
      scope: 'images',
      delayMs: 500,
    });

    // Should not have been called yet
    expect(invalidateSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);

    expect(invalidateSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('invalidateAllShotGenerations', () => {
  it('invalidates using predicate matching byShotAll key', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    invalidateAllShotGenerations(queryClient);

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        predicate: expect.any(Function),
      })
    );
  });
});

describe('invalidateVariantChange', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
  });

  it('invalidates variant-specific queries', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const generationId = 'gen-123';

    await invalidateVariantChange(queryClient, {
      generationId,
      reason: 'test',
    });

    const calls = invalidateSpy.mock.calls.map(c => c[0]);
    const queryKeysUsed = calls.map(c => (c as { queryKey: unknown }).queryKey).filter(Boolean);

    expect(queryKeysUsed).toContainEqual(queryKeys.generations.variants(generationId));
    expect(queryKeysUsed).toContainEqual(queryKeys.generations.detail(generationId));
    expect(queryKeysUsed).toContainEqual(queryKeys.generations.variantBadges);
  });

  it('refetches shot when shotId is provided', async () => {
    const refetchSpy = vi.spyOn(queryClient, 'refetchQueries');
    const generationId = 'gen-123';
    const shotId = 'shot-123';

    await invalidateVariantChange(queryClient, {
      generationId,
      reason: 'test',
      shotId,
    });

    const calls = refetchSpy.mock.calls.map(c => c[0]);
    const queryKeysUsed = calls.map(c => (c as { queryKey: unknown }).queryKey).filter(Boolean);

    expect(queryKeysUsed).toContainEqual(queryKeys.generations.byShot(shotId));
  });

  it('invalidates unified.all as fallback when no projectId', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await invalidateVariantChange(queryClient, {
      generationId: 'gen-123',
      reason: 'test',
    });

    const calls = invalidateSpy.mock.calls.map(c => c[0]);
    const queryKeysUsed = calls.map(c => (c as { queryKey: unknown }).queryKey).filter(Boolean);

    expect(queryKeysUsed).toContainEqual(queryKeys.unified.all);
    expect(queryKeysUsed).toContainEqual(queryKeys.generations.derivedAll);
    // Should NOT invalidate generations.all (specific detail() already covers it)
    expect(queryKeysUsed).not.toContainEqual(queryKeys.generations.all);
  });

  it('invalidates project-scoped unified (not all) when projectId is provided', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const projectId = 'project-123';

    await invalidateVariantChange(queryClient, {
      generationId: 'gen-123',
      reason: 'test',
      projectId,
    });

    const calls = invalidateSpy.mock.calls.map(c => c[0]);
    const queryKeysUsed = calls.map(c => (c as { queryKey: unknown }).queryKey).filter(Boolean);

    expect(queryKeysUsed).toContainEqual(queryKeys.unified.projectPrefix(projectId));
    // Should NOT invalidate unified.all when projectId is available
    expect(queryKeysUsed).not.toContainEqual(queryKeys.unified.all);
  });

  it('applies delay when delayMs is specified', async () => {
    vi.useFakeTimers();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const promise = invalidateVariantChange(queryClient, {
      generationId: 'gen-123',
      reason: 'test',
      delayMs: 200,
    });

    // Should not have been called yet
    expect(invalidateSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    await promise;

    expect(invalidateSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('settles superseded delayed callers instead of leaving pending awaits', async () => {
    vi.useFakeTimers();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const first = invalidateVariantChange(queryClient, {
      generationId: 'gen-123',
      reason: 'first',
      delayMs: 500,
    });

    // Queue a superseding call before the first delay elapses.
    await vi.advanceTimersByTimeAsync(100);

    const second = invalidateVariantChange(queryClient, {
      generationId: 'gen-123',
      reason: 'second',
      delayMs: 500,
    });

    // First caller settles immediately once superseded and should not execute invalidation.
    await expect(first).resolves.toBeUndefined();
    expect(invalidateSpy).not.toHaveBeenCalled();

    // Second caller settles after its own delay window.
    await vi.advanceTimersByTimeAsync(500);
    await expect(second).resolves.toBeUndefined();
    expect(invalidateSpy).toHaveBeenCalledTimes(7);

    vi.useRealTimers();
  });
});
