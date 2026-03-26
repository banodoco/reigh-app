import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCreateEffectResource,
  useDeleteEffectResource,
  useEffectResources,
  useUpdateEffectResource,
} from './useEffectResources';

const mocks = vi.hoisted(() => ({
  useListResources: vi.fn(),
  useListPublicResources: vi.fn(),
  useCreateResource: vi.fn(),
  useUpdateResource: vi.fn(),
  useDeleteResource: vi.fn(),
}));

vi.mock('@/features/resources/hooks/useResources', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/resources/hooks/useResources')>();
  return {
    ...actual,
    useListResources: (...args: unknown[]) => mocks.useListResources(...args),
    useListPublicResources: (...args: unknown[]) => mocks.useListPublicResources(...args),
    useCreateResource: (...args: unknown[]) => mocks.useCreateResource(...args),
    useUpdateResource: (...args: unknown[]) => mocks.useUpdateResource(...args),
    useDeleteResource: (...args: unknown[]) => mocks.useDeleteResource(...args),
  };
});

describe('useEffectResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.useListResources.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });
    mocks.useListPublicResources.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('deduplicates by resource id and groups effects by category', () => {
    mocks.useListResources.mockReturnValue({
      data: [
        {
          id: 'effect-1',
          type: 'effect',
          metadata: {
            name: 'Slide In',
            slug: 'slide-in',
            code: 'code-1',
            category: 'entrance',
            description: 'Slides in',
            created_by: { is_you: true },
            is_public: false,
          },
        },
        {
          id: 'effect-2',
          type: 'effect',
          metadata: {
            name: 'Fade Out',
            slug: 'fade-out',
            code: 'code-2-private',
            category: 'exit',
            description: 'Fades out',
            created_by: { is_you: true },
            is_public: false,
          },
        },
      ],
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });

    mocks.useListPublicResources.mockReturnValue({
      data: [
        {
          id: 'effect-2',
          type: 'effect',
          metadata: {
            name: 'Fade Out Public',
            slug: 'fade-out-public',
            code: 'code-2-public',
            category: 'exit',
            description: 'Public duplicate',
            created_by: { is_you: false, username: 'other-user' },
            is_public: true,
          },
        },
        {
          id: 'effect-3',
          type: 'effect',
          metadata: {
            name: 'Pulse Loop',
            slug: 'pulse-loop',
            code: 'code-3',
            category: 'continuous',
            description: 'Loops continuously',
            created_by: { is_you: false, username: 'other-user' },
            is_public: true,
          },
        },
      ],
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useEffectResources('user-1'));

    expect(result.current.effects).toHaveLength(3);
    expect(result.current.entrance.map((effect) => effect.id)).toEqual(['effect-1']);
    expect(result.current.exit.map((effect) => effect.id)).toEqual(['effect-2']);
    expect(result.current.continuous.map((effect) => effect.id)).toEqual(['effect-3']);
    expect(result.current.exit[0]).toMatchObject({
      id: 'effect-2',
      name: 'Fade Out Public',
      category: 'exit',
    });
  });

  it('wraps create, update, and delete mutations with the fixed effect resource type', async () => {
    const createMutate = vi.fn();
    const createMutateAsync = vi.fn().mockResolvedValue({ id: 'created' });
    const updateMutate = vi.fn();
    const updateMutateAsync = vi.fn().mockResolvedValue({ id: 'updated' });
    const deleteMutate = vi.fn();
    const deleteMutateAsync = vi.fn().mockResolvedValue(undefined);

    mocks.useCreateResource.mockReturnValue({ mutate: createMutate, mutateAsync: createMutateAsync });
    mocks.useUpdateResource.mockReturnValue({ mutate: updateMutate, mutateAsync: updateMutateAsync });
    mocks.useDeleteResource.mockReturnValue({ mutate: deleteMutate, mutateAsync: deleteMutateAsync });

    const createHook = renderHook(() => useCreateEffectResource());
    const updateHook = renderHook(() => useUpdateEffectResource());
    const deleteHook = renderHook(() => useDeleteEffectResource());

    const metadata = {
      name: 'Slide In',
      slug: 'slide-in',
      code: 'code',
      category: 'entrance' as const,
      description: 'Slides in',
      created_by: { is_you: true },
      is_public: false,
    };

    await act(async () => {
      await createHook.result.current.mutateAsync({ metadata });
      await updateHook.result.current.mutateAsync({ id: 'effect-1', metadata });
      await deleteHook.result.current.mutateAsync({ id: 'effect-1' });
    });

    expect(createMutateAsync).toHaveBeenCalledWith({ type: 'effect', metadata }, undefined);
    expect(updateMutateAsync).toHaveBeenCalledWith({ id: 'effect-1', type: 'effect', metadata }, undefined);
    expect(deleteMutateAsync).toHaveBeenCalledWith({ id: 'effect-1', type: 'effect' }, undefined);
  });
});
