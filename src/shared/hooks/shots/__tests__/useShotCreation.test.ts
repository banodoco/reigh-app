import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderHookWithProviders } from '@/test/test-utils';

const { mockRpc, mockFrom } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockInsert: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mockRpc,
    from: mockFrom,
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({
          data: { session: { user: { id: 'user-1' } } },
        })
      ),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
      })),
    },
  },
}));

vi.mock('@/shared/lib/compat/errorHandler', () => ({
  handleError: vi.fn(),
}));

vi.mock('@/shared/lib/imageUploader', () => ({
  uploadImageToStorage: vi.fn().mockResolvedValue('uploaded.jpg'),
}));

vi.mock('@/shared/media/clientThumbnailGenerator', () => ({
  generateClientThumbnail: vi.fn().mockResolvedValue({
    thumbnailBlob: new Blob(),
    width: 300,
    height: 200,
  }),
  uploadImageWithThumbnail: vi.fn().mockResolvedValue({
    imageUrl: 'uploaded.jpg',
    thumbnailUrl: 'thumb.jpg',
  }),
}));

vi.mock('@/shared/lib/imageCropper', () => ({
  cropImageToProjectAspectRatio: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/shared/lib/media/aspectRatios', () => ({
  parseRatio: vi.fn(() => 16 / 9),
}));

vi.mock('@/shared/hooks/invalidation/useGenerationInvalidation', () => ({
  invalidateGenerationsSync: vi.fn(),
}));

vi.mock('../useShotsCrud', () => ({
  useCreateShot: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({
      shot: { id: 'new-shot-1', name: 'Shot 1' },
    }),
  })),
}));

vi.mock('../useShotGenerationMutations', () => ({
  useAddImageToShot: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  })),
  useAddImageToShotWithoutPosition: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { useCreateShotWithImage, useHandleExternalImageDrop } from '../useShotCreation';

describe('useCreateShotWithImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          success: true,
          shot_id: 'shot-1',
          shot_name: 'Shot 1',
          shot_generation_id: 'sg-1',
        },
        error: null,
      }),
    });
  });

  it('returns a mutation', () => {
    const { result } = renderHookWithProviders(() => useCreateShotWithImage());

    expect(typeof result.current.mutateAsync).toBe('function');
    expect(result.current.isPending).toBe(false);
  });

  it('calls the RPC function on mutate', async () => {
    const { result } = renderHookWithProviders(() => useCreateShotWithImage());

    await act(async () => {
      await result.current.mutateAsync({
        projectId: 'proj-1',
        shotName: 'New Shot',
        generationId: 'gen-1',
      });
    });

    expect(mockRpc).toHaveBeenCalledWith('create_shot_with_image', {
      p_project_id: 'proj-1',
      p_shot_name: 'New Shot',
      p_generation_id: 'gen-1',
    });
  });

  it('returns shot data on success', async () => {
    const { result } = renderHookWithProviders(() => useCreateShotWithImage());

    let mutateResult: unknown;
    await act(async () => {
      mutateResult = await result.current.mutateAsync({
        projectId: 'proj-1',
        shotName: 'New Shot',
        generationId: 'gen-1',
      });
    });

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mutateResult.shotId).toBe('shot-1');
    expect(mutateResult.shotName).toBe('Shot 1');
  });
});

describe('useHandleExternalImageDrop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { aspect_ratio: '16:9', settings: {} },
            error: null,
          }),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { id: 'gen-new', location: 'uploaded.jpg' },
            error: null,
          }),
        })),
      })),
    });
  });

  it('returns a mutation', () => {
    const { result } = renderHookWithProviders(() =>
      useHandleExternalImageDrop()
    );

    expect(typeof result.current.mutateAsync).toBe('function');
    expect(result.current.isPending).toBe(false);
  });

  it('returns null when no project ID', async () => {
    const { result } = renderHookWithProviders(() =>
      useHandleExternalImageDrop()
    );

    let mutateResult: unknown;
    await act(async () => {
      mutateResult = await result.current.mutateAsync({
        imageFiles: [new File(['data'], 'test.jpg', { type: 'image/jpeg' })],
        targetShotId: 'shot-1',
        currentProjectQueryKey: null,
        currentShotCount: 0,
      });
    });

    expect(mutateResult).toBeNull();
  });
});
