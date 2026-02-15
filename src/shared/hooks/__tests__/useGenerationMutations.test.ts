import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock supabase
const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

import {
  useDeleteGeneration,
  useDeleteVariant,
  useUpdateGenerationLocation,
  useCreateGeneration,
  useToggleGenerationStar,
} from '../useGenerationMutations';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

describe('useDeleteGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes from generations table', async () => {
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: deleteEq,
      }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDeleteGeneration(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('gen-123');
    });

    expect(mockFrom).toHaveBeenCalledWith('generations');
  });

  it('throws on error', async () => {
    const deleteEq = vi.fn().mockResolvedValue({
      error: { message: 'Not found' },
    });
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: deleteEq,
      }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDeleteGeneration(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync('gen-123');
      })
    ).rejects.toThrow('Failed to delete generation');
  });
});

describe('useDeleteVariant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes from generation_variants table', async () => {
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: deleteEq,
      }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDeleteVariant(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('variant-123');
    });

    expect(mockFrom).toHaveBeenCalledWith('generation_variants');
  });
});

describe('useUpdateGenerationLocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates generation with location', async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: updateEq,
      }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateGenerationLocation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'gen-123',
        location: 'https://example.com/new.png',
      });
    });

    expect(mockFrom).toHaveBeenCalledWith('generations');
  });

  it('includes thumbUrl when provided', async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    mockFrom.mockReturnValue({ update: mockUpdate });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateGenerationLocation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'gen-123',
        location: 'https://example.com/new.png',
        thumbUrl: 'https://example.com/new-thumb.png',
      });
    });

    expect(mockUpdate).toHaveBeenCalledWith({
      location: 'https://example.com/new.png',
      thumbnail_url: 'https://example.com/new-thumb.png',
    });
  });
});

describe('useCreateGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates generation and variant', async () => {
    const mockSingle = vi.fn()
      .mockResolvedValueOnce({
        data: { id: 'gen-new', location: 'https://example.com/image.png' },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });

    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: mockSingle,
        }),
      }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateGeneration(), { wrapper });

    let data: unknown;
    await act(async () => {
      data = await result.current.mutateAsync({
        imageUrl: 'https://example.com/image.png',
        fileName: 'test.png',
        fileType: 'image',
        fileSize: 1024,
        projectId: 'project-1',
        prompt: 'test prompt',
      });
    });

    expect(data).toHaveProperty('id', 'gen-new');
    // Should have been called for both generations and generation_variants
    expect(mockFrom).toHaveBeenCalledWith('generations');
    expect(mockFrom).toHaveBeenCalledWith('generation_variants');
  });
});

describe('useToggleGenerationStar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stars a generation', async () => {
    const mockSelect = vi.fn().mockResolvedValue({
      data: [{ id: 'gen-123', starred: true }],
      error: null,
    });
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: mockSelect,
        }),
      }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useToggleGenerationStar(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 'gen-123', starred: true });
    });

    expect(mockFrom).toHaveBeenCalledWith('generations');
  });

  it('dispatches custom event on success with shotId', async () => {
    const mockSelect = vi.fn().mockResolvedValue({
      data: [{ id: 'gen-123', starred: true }],
      error: null,
    });
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: mockSelect,
        }),
      }),
    });

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useToggleGenerationStar(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'gen-123',
        starred: true,
        shotId: 'shot-456',
      });
    });

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'generation-star-updated',
        detail: {
          generationId: 'gen-123',
          shotId: 'shot-456',
          starred: true,
        },
      })
    );

    dispatchSpy.mockRestore();
  });

  it('throws when no rows updated (RLS policy issue)', async () => {
    const mockSelect = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: mockSelect,
        }),
      }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useToggleGenerationStar(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ id: 'gen-123', starred: true });
      })
    ).rejects.toThrow('No rows updated');
  });
});
