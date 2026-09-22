import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { renderHookWithProviders } from '@/test/test-utils';

const mockUpdate = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => mockUpdate()),
      })),
    })),
  }),
}));

import { useToggleVariantStar } from '@/shared/hooks/variants/useToggleVariantStar';

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

  it.each([
    ['/tools/video-editor?localProject=local-project&localTimeline=timeline-1', 'local Runtime'],
    ['/tools/image-generation?runtime=1&runtimeProject=runtime-project&runtimeTimeline=timeline-1', 'explicit Runtime'],
  ])('suppresses %s star mutations before network work', async (path) => {
    window.history.replaceState({}, '', path);
    const { result } = renderHookWithProviders(() => useToggleVariantStar());

    act(() => {
      result.current.toggleStar({
        variantId: 'v-runtime',
        generationId: 'g-runtime',
        starred: true,
      });
    });

    await waitFor(() => expect(result.current.isToggling).toBe(false));
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
