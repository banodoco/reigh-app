import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationRow } from '@/domains/generation/types';
import { useVariantSelection } from '../useVariantSelection';

const markViewed = vi.fn();

vi.mock('@/shared/hooks/useMarkVariantViewed', () => ({
  useMarkVariantViewed: () => ({ markViewed }),
}));

const baseMedia: GenerationRow = {
  id: 'media-1',
  generation_id: 'gen-media',
};

const variantA = { id: 'variant-a', is_primary: true };
const variantB = { id: 'variant-b', is_primary: false };

describe('useVariantSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses viewedGenerationId when marking a selected variant as viewed', () => {
    const rawSetActiveVariantId = vi.fn();
    const { result } = renderHook(() =>
      useVariantSelection({
        media: baseMedia,
        viewedGenerationId: 'gen-fetch-scope',
        rawSetActiveVariantId,
        activeVariant: null,
        variants: [variantA, variantB],
      })
    );

    act(() => {
      result.current.setActiveVariantId('variant-b');
    });

    expect(markViewed).toHaveBeenCalledWith({
      variantId: 'variant-b',
      generationId: 'gen-fetch-scope',
    });
    expect(rawSetActiveVariantId).toHaveBeenCalledWith('variant-b');
  });

  it('falls back to media generation ID when viewedGenerationId is absent', () => {
    const rawSetActiveVariantId = vi.fn();
    const { result } = renderHook(() =>
      useVariantSelection({
        media: baseMedia,
        rawSetActiveVariantId,
        activeVariant: null,
        variants: [variantA, variantB],
      })
    );

    act(() => {
      result.current.setActiveVariantId('variant-a');
    });

    expect(markViewed).toHaveBeenCalledWith({
      variantId: 'variant-a',
      generationId: 'gen-media',
    });
    expect(rawSetActiveVariantId).toHaveBeenCalledWith('variant-a');
  });

  it('marks active variant once per ID and skips duplicate rerenders', async () => {
    const rawSetActiveVariantId = vi.fn();
    const { rerender } = renderHook(
      ({
        activeVariant,
      }: {
        activeVariant: { id: string; is_primary: boolean } | null;
      }) =>
        useVariantSelection({
          media: baseMedia,
          viewedGenerationId: 'gen-fetch-scope',
          rawSetActiveVariantId,
          activeVariant,
          variants: [variantA, variantB],
        }),
      {
        initialProps: { activeVariant: variantA },
      }
    );

    await waitFor(() => {
      expect(markViewed).toHaveBeenCalledTimes(1);
    });
    expect(markViewed).toHaveBeenLastCalledWith({
      variantId: 'variant-a',
      generationId: 'gen-fetch-scope',
    });

    rerender({ activeVariant: variantA });
    expect(markViewed).toHaveBeenCalledTimes(1);

    rerender({ activeVariant: variantB });
    await waitFor(() => {
      expect(markViewed).toHaveBeenCalledTimes(2);
    });
    expect(markViewed).toHaveBeenLastCalledWith({
      variantId: 'variant-b',
      generationId: 'gen-fetch-scope',
    });
  });
});
