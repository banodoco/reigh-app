import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { renderHookWithProviders } from '@/test/test-utils';

const mockQueryResult = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => ({
            in: vi.fn(() => mockQueryResult()),
          })),
        })),
      })),
    })),
  },
}));

import { usePendingSegmentTasks } from '../usePendingSegmentTasks';

describe('usePendingSegmentTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryResult.mockResolvedValue({ data: [], error: null });
  });

  it('returns expected shape when disabled', () => {
    const { result } = renderHookWithProviders(() =>
      usePendingSegmentTasks(null, null)
    );

    expect(typeof result.current.hasPendingTask).toBe('function');
    expect(typeof result.current.getTaskStatus).toBe('function');
    expect(typeof result.current.addOptimisticPending).toBe('function');
    expect(result.current.pendingPairIds).toBeInstanceOf(Set);
    expect(result.current.pendingPairIds.size).toBe(0);
  });

  it('hasPendingTask returns false for null input', () => {
    const { result } = renderHookWithProviders(() =>
      usePendingSegmentTasks('shot-1', 'proj-1')
    );

    expect(result.current.hasPendingTask(null)).toBe(false);
    expect(result.current.hasPendingTask(undefined)).toBe(false);
  });

  it('getTaskStatus returns null for null input', () => {
    const { result } = renderHookWithProviders(() =>
      usePendingSegmentTasks('shot-1', 'proj-1')
    );

    expect(result.current.getTaskStatus(null)).toBeNull();
    expect(result.current.getTaskStatus(undefined)).toBeNull();
  });

  it('addOptimisticPending makes hasPendingTask return true', () => {
    const { result } = renderHookWithProviders(() =>
      usePendingSegmentTasks('shot-1', 'proj-1')
    );

    act(() => {
      result.current.addOptimisticPending('psg-1');
    });

    expect(result.current.hasPendingTask('psg-1')).toBe(true);
  });

  it('addOptimisticPending ignores null', () => {
    const { result } = renderHookWithProviders(() =>
      usePendingSegmentTasks('shot-1', 'proj-1')
    );

    act(() => {
      result.current.addOptimisticPending(null);
    });

    expect(result.current.pendingPairIds.size).toBe(0);
  });

  it('isLoading is false when disabled', () => {
    const { result } = renderHookWithProviders(() =>
      usePendingSegmentTasks(null, null)
    );

    expect(result.current.isLoading).toBe(false);
  });
});
