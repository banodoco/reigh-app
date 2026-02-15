import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderHookWithProviders } from '@/test/test-utils';

const mockVariantSingle = vi.fn();
const mockInsertSingle = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'generation_variants') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: () => mockVariantSingle(),
            })),
          })),
        };
      }
      return {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: () => mockInsertSingle(),
          })),
        })),
      };
    }),
  },
}));

vi.mock('@/shared/lib/typeGuards', () => ({
  hasVideoExtension: vi.fn((url: string) => url?.endsWith('.mp4')),
}));

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

import { usePromoteVariantToGeneration } from '../usePromoteVariantToGeneration';

describe('usePromoteVariantToGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns mutation object', () => {
    const { result } = renderHookWithProviders(() => usePromoteVariantToGeneration());
    expect(typeof result.current.mutateAsync).toBe('function');
    expect(result.current.isPending).toBe(false);
  });

  it('promotes an image variant', async () => {
    mockVariantSingle.mockResolvedValue({
      data: {
        id: 'v-1',
        generation_id: 'gen-1',
        location: 'image.jpg',
        thumbnail_url: 'thumb.jpg',
        params: { tool_type: 'edit-images' },
      },
      error: null,
    });

    mockInsertSingle.mockResolvedValue({
      data: {
        id: 'new-gen-1',
        location: 'image.jpg',
        thumbnail_url: 'thumb.jpg',
        type: 'image',
        project_id: 'proj-1',
        based_on: 'gen-1',
        params: {},
      },
      error: null,
    });

    const { result } = renderHookWithProviders(() => usePromoteVariantToGeneration());

    let promoted: unknown;
    await act(async () => {
      promoted = await result.current.mutateAsync({
        variantId: 'v-1',
        projectId: 'proj-1',
      });
    });

    expect((promoted as { id: string }).id).toBe('new-gen-1');
  });

  it('throws when variant not found', async () => {
    mockVariantSingle.mockResolvedValue({
      data: null,
      error: { message: 'Not found' },
    });

    const { result } = renderHookWithProviders(() => usePromoteVariantToGeneration());

    await expect(
      result.current.mutateAsync({ variantId: 'bad-id', projectId: 'proj-1' })
    ).rejects.toThrow('Failed to fetch variant');
  });
});
