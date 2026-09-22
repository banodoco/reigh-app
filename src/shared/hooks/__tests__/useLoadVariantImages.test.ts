import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderHookWithProviders } from '@/test/test-utils';

const mockSelectSingle = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockEnqueueVariantInvalidation = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mockSelectSingle,
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => mockUpdate()),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: mockInsert,
        })),
      })),
    })),
  }),
}));

vi.mock('@/shared/hooks/invalidation/useGenerationInvalidation', () => ({
  enqueueVariantInvalidation: (...args: unknown[]) => mockEnqueueVariantInvalidation(...args),
}));

import { useLoadVariantImages } from '@/shared/hooks/variants/useLoadVariantImages';

describe('useLoadVariantImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({ error: null });
    mockInsert.mockResolvedValue({ data: { id: 'new-variant' }, error: null });
  });

  it('returns loadVariantImages function', () => {
    const { result } = renderHookWithProviders(() =>
      useLoadVariantImages({
        currentSegmentImages: undefined,
      })
    );

    expect(typeof result.current.loadVariantImages).toBe('function');
  });

  it('does nothing when currentSegmentImages is undefined', async () => {
    const { result } = renderHookWithProviders(() =>
      useLoadVariantImages({
        currentSegmentImages: undefined,
      })
    );

    const mockVariant = { params: { start_image_generation_id: 'gen-1' } } as unknown;

    await act(async () => {
      await result.current.loadVariantImages(mockVariant);
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does nothing when variant has no params', async () => {
    const { result } = renderHookWithProviders(() =>
      useLoadVariantImages({
        currentSegmentImages: {
          startGenerationId: 'gen-1',
          endGenerationId: 'gen-2',
          startUrl: 'start.jpg',
          endUrl: 'end.jpg',
        } as unknown,
      })
    );

    const mockVariant = { params: null } as unknown;

    await act(async () => {
      await result.current.loadVariantImages(mockVariant);
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it.each([
    '/tools/video-editor?localProject=local-project&localTimeline=timeline-1',
    '/tools/image-generation?runtime=1&runtimeProject=runtime-project&runtimeTimeline=timeline-1',
  ])('does not read or write legacy variants on %s', async (path) => {
    window.history.replaceState({}, '', path);
    const { result } = renderHookWithProviders(() => useLoadVariantImages({
      currentSegmentImages: {
        startGenerationId: 'gen-current',
        startVariantId: 'variant-current',
        startUrl: 'start.jpg',
      } as unknown,
    }));

    await act(async () => {
      await result.current.loadVariantImages({
        generation_id: 'generation-1',
        id: 'variant-1',
        location: 'variant.jpg',
        thumbnail_url: null,
        params: {
          start_image_generation_id: 'gen-source',
          start_image_url: 'source.jpg',
        },
      } as never);
    });

    expect(mockSelectSingle).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockEnqueueVariantInvalidation).not.toHaveBeenCalled();
  });
});
