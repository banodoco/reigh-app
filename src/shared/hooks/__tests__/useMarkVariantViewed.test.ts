import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { renderHookWithProviders } from '@/test/test-utils';

const mockUpdateResult = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => mockUpdateResult()),
          // For bulk mutation (no .is)
        })),
      })),
    })),
  },
}));

vi.mock('@/shared/lib/compat/errorHandler', () => ({
  handleError: vi.fn(),
}));

import { useMarkVariantViewed } from '../useMarkVariantViewed';

describe('useMarkVariantViewed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateResult.mockResolvedValue({ error: null });
  });

  it('returns markViewed and markAllViewed functions', () => {
    const { result } = renderHookWithProviders(() => useMarkVariantViewed());
    expect(typeof result.current.markViewed).toBe('function');
    expect(typeof result.current.markAllViewed).toBe('function');
    expect(result.current.isMarking).toBe(false);
    expect(result.current.isMarkingAll).toBe(false);
  });

  it('marks single variant as viewed', async () => {
    const { result } = renderHookWithProviders(() => useMarkVariantViewed());

    act(() => {
      result.current.markViewed({ variantId: 'v-1' });
    });

    await waitFor(() => {
      expect(result.current.isMarking).toBe(false);
    });
  });

  it('marks single variant with generation ID for optimistic update', async () => {
    const { result } = renderHookWithProviders(() => useMarkVariantViewed());

    act(() => {
      result.current.markViewed({ variantId: 'v-1', generationId: 'gen-1' });
    });

    await waitFor(() => {
      expect(result.current.isMarking).toBe(false);
    });
  });

  it('marks all variants for a generation', async () => {
    const { result } = renderHookWithProviders(() => useMarkVariantViewed());

    act(() => {
      result.current.markAllViewed('gen-1');
    });

    await waitFor(() => {
      expect(result.current.isMarkingAll).toBe(false);
    });
  });
});
