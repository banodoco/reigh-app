import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { renderHookWithProviders } from '@/test/test-utils';

const mockUpdate = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => mockUpdate()),
      })),
    })),
  },
}));

vi.mock('@/shared/lib/compat/errorHandler', () => ({
  handleError: vi.fn(),
}));

import { useToggleVariantStar } from '../useToggleVariantStar';

describe('useToggleVariantStar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({ error: null });
  });

  it('returns toggleStar function and isToggling state', () => {
    const { result } = renderHookWithProviders(() => useToggleVariantStar());
    expect(typeof result.current.toggleStar).toBe('function');
    expect(result.current.isToggling).toBe(false);
  });

  it('calls supabase to toggle star', async () => {
    const { result } = renderHookWithProviders(() => useToggleVariantStar());

    act(() => {
      result.current.toggleStar({
        variantId: 'v-1',
        generationId: 'g-1',
        starred: true,
      });
    });

    await waitFor(() => {
      expect(result.current.isToggling).toBe(false);
    });
  });

  it('handles errors gracefully', async () => {
    mockUpdate.mockResolvedValue({ error: new Error('DB error') });
    const { result } = renderHookWithProviders(() => useToggleVariantStar());

    act(() => {
      result.current.toggleStar({
        variantId: 'v-1',
        generationId: 'g-1',
        starred: true,
      });
    });

    await waitFor(() => {
      expect(result.current.isToggling).toBe(false);
    });
  });
});
