import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderHookWithProviders } from '@/test/test-utils';

const mockSingle = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: () => mockSingle(),
        })),
      })),
    })),
  },
}));

import { usePairMetadata } from '../usePairMetadata';

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

  it('returns null on error', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'Not found' },
    });

    const { result } = renderHookWithProviders(() => usePairMetadata('pair-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.data).toBeNull();
  });

  it('provides refetch function', () => {
    const { result } = renderHookWithProviders(() => usePairMetadata('pair-1'));
    expect(typeof result.current.refetch).toBe('function');
  });
});
