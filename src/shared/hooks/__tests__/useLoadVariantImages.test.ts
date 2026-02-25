import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderHookWithProviders } from '@/test/test-utils';

const mockSelectSingle = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
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
  },
}));

vi.mock('@/shared/hooks/invalidation/useGenerationInvalidation', () => ({
  invalidateVariantChange: vi.fn(),
}));

vi.mock('@/shared/lib/compat/errorHandler', () => ({
  handleError: vi.fn(),
}));

import { useLoadVariantImages } from '../useLoadVariantImages';

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
});
