import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderHookWithProviders } from '@/test/test-utils';

const mockSingle = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: () => mockSingle(),
        })),
      })),
    })),
  }),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

import { usePairMetadata } from '../usePairMetadata';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

describe('usePairMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null data when pairShotGenerationId is null', () => {
    const { result } = renderHookWithProviders(() => usePairMetadata(null));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('returns null data when pairShotGenerationId is undefined', () => {
    const { result } = renderHookWithProviders(() => usePairMetadata(undefined));
    expect(result.current.data).toBeUndefined();
  });

  it('fetches metadata when id is provided', async () => {
    mockSingle.mockResolvedValue({
      data: { metadata: { prompt: 'test prompt', numFrames: 25 } },
      error: null,
    });

    const { result } = renderHookWithProviders(() => usePairMetadata('pair-1'));

    await waitFor(() => {
      expect(result.current.data).toEqual({ prompt: 'test prompt', numFrames: 25 });
    });
  });

  it('surfaces query errors consistently', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'Not found' },
    });

    const { result } = renderHookWithProviders(() => usePairMetadata('pair-1'));

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    expect(result.current.data).toBeUndefined();
    expect(normalizeAndPresentError).toHaveBeenCalledTimes(1);
  });

  it('provides refetch function', () => {
    const { result } = renderHookWithProviders(() => usePairMetadata('pair-1'));
    expect(typeof result.current.refetch).toBe('function');
  });
});
