import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useResourceBrowserData } from './useResourceBrowserData';

const mocks = vi.hoisted(() => ({
  useListPublicResources: vi.fn(),
  useListResources: vi.fn(),
  useUpdateResource: vi.fn(),
  processImageUrl: vi.fn(),
  normalizeAndPresentError: vi.fn(),
  getSupabaseClient: vi.fn(),
}));

vi.mock('@/features/resources/hooks/useResources', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/resources/hooks/useResources')>();
  return {
    ...actual,
    useListPublicResources: (...args: unknown[]) => mocks.useListPublicResources(...args),
    useListResources: (...args: unknown[]) => mocks.useListResources(...args),
    useUpdateResource: (...args: unknown[]) => mocks.useUpdateResource(...args),
  };
});

vi.mock('@/shared/lib/urlToFile', () => ({
  processImageUrl: (...args: unknown[]) => mocks.processImageUrl(...args),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mocks.normalizeAndPresentError(...args),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: (...args: unknown[]) => mocks.getSupabaseClient(...args),
}));

describe('useResourceBrowserData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSupabaseClient.mockReturnValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: 'user-1' } } },
        }),
      },
    });
  });

  it('combines public and personal resources, de-duplicates by id, and applies search', async () => {
    const publicResources = [
      { id: 'r1', userId: 'user-2', metadata: { name: 'Cat Dream', styleReferenceImageOriginal: 'https://a/1.png' } },
      { id: 'r2', userId: 'user-2', metadata: { name: 'Ocean', styleReferenceImageOriginal: 'https://a/2.png' } },
    ];
    const myResources = [
      { id: 'r2', userId: 'user-1', metadata: { name: 'Ocean', styleReferenceImageOriginal: 'https://a/2.png' } },
      { id: 'r3', userId: 'user-1', metadata: { name: 'Cat Sketch', styleReferenceImageOriginal: 'https://a/3.png' } },
    ];

    mocks.useListPublicResources.mockReturnValue({ data: publicResources, isLoading: false });
    mocks.useListResources.mockReturnValue({ data: myResources, isLoading: false });
    mocks.useUpdateResource.mockReturnValue({ mutateAsync: vi.fn() });

    const { result } = renderHook(() =>
      useResourceBrowserData({
        isOpen: true,
        resourceType: 'style-reference',
        onOpenChange: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(result.current.userId).toBe('user-1');
    });

    expect(result.current.filteredResources).toHaveLength(3);

    act(() => {
      result.current.handleSearch('cat');
    });

    expect(result.current.filteredResources.map((resource) => resource.id)).toEqual(['r1', 'r3']);
    expect(result.current.currentPage).toBe(1);
  });

  it('toggles visibility and handles style-reference selection via onImageSelect', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    const selectedResource = {
      id: 'r1',
      userId: 'user-1',
      metadata: {
        name: 'My Ref',
        is_public: false,
        styleReferenceImageOriginal: 'https://example.com/ref.png',
      },
    };

    mocks.useListPublicResources.mockReturnValue({ data: [selectedResource], isLoading: false });
    mocks.useListResources.mockReturnValue({ data: [selectedResource], isLoading: false });
    mocks.useUpdateResource.mockReturnValue({ mutateAsync });

    const imageFile = new File(['img'], 'my_ref.png', { type: 'image/png' });
    mocks.processImageUrl.mockResolvedValue(imageFile);

    const onOpenChange = vi.fn();
    const onImageSelect = vi.fn();

    const { result } = renderHook(() =>
      useResourceBrowserData({
        isOpen: true,
        resourceType: 'style-reference',
        onOpenChange,
        onImageSelect,
      }),
    );

    await act(async () => {
      await result.current.handleToggleVisibility('r1', false);
    });
    expect(mutateAsync).toHaveBeenCalledWith({
      id: 'r1',
      type: 'style-reference',
      metadata: expect.objectContaining({ is_public: true }),
    });

    await act(async () => {
      await result.current.handleResourceClick(selectedResource as never);
    });
    expect(mocks.processImageUrl).toHaveBeenCalledWith(
      'https://example.com/ref.png',
      'My_Ref.png',
    );
    expect(onImageSelect).toHaveBeenCalledWith([imageFile]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
