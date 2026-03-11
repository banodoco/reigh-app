// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useVariants: vi.fn(),
  useVariantSelection: vi.fn(),
  useVariantPromotion: vi.fn(),
  rawSetActiveVariantId: vi.fn(),
  refetchVariants: vi.fn(),
  setPrimaryVariant: vi.fn(),
  deleteVariant: vi.fn(),
}));

vi.mock('@/shared/hooks/variants/useVariants', () => ({
  useVariants: (...args: unknown[]) => mocks.useVariants(...args),
}));

vi.mock('../useVariantSelection', () => ({
  useVariantSelection: (...args: unknown[]) => mocks.useVariantSelection(...args),
}));

vi.mock('../useVariantPromotion', () => ({
  useVariantPromotion: (...args: unknown[]) => mocks.useVariantPromotion(...args),
}));

import { useSharedLightboxVariantState } from './useSharedLightboxVariantState';

let activeVariantState: { id: string } | null = { id: 'variant-a' };

describe('useSharedLightboxVariantState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeVariantState = { id: 'variant-a' };

    mocks.useVariants.mockImplementation((input: { generationId: string | null; enabled: boolean }) => ({
      variants: [{ id: 'variant-a' }, { id: 'variant-b' }],
      primaryVariant: { id: 'variant-a' },
      activeVariant: activeVariantState,
      isLoading: false,
      setActiveVariantId: mocks.rawSetActiveVariantId,
      refetch: mocks.refetchVariants,
      setPrimaryVariant: mocks.setPrimaryVariant,
      deleteVariant: mocks.deleteVariant,
      generationId: input.generationId,
      enabled: input.enabled,
    }));

    mocks.useVariantSelection.mockImplementation((input: { rawSetActiveVariantId: (id: string) => void; activeVariant: { id: string } | null }) => ({
      setActiveVariantId: input.rawSetActiveVariantId,
      isViewingNonPrimaryVariant: input.activeVariant?.id === 'variant-b',
    }));

    mocks.useVariantPromotion.mockReturnValue({
      promoteSuccess: { isSuccessful: true },
      isPromoting: false,
      handlePromoteToGeneration: vi.fn(),
      handleAddVariantAsNewGenerationToShot: vi.fn(),
    });
  });

  it('passes form-only mode through to useVariants and tracks intended active variant IDs', () => {
    const { result } = renderHook(() =>
      useSharedLightboxVariantState({
        media: { id: 'media-1' } as never,
        variantFetchGenerationId: 'gen-1',
        initialVariantId: 'variant-a',
        isFormOnlyMode: true,
        selectedProjectId: 'project-1',
      }),
    );

    expect(mocks.useVariants).toHaveBeenCalledWith({
      generationId: 'gen-1',
      enabled: false,
    });

    act(() => {
      result.current.setActiveVariantId('variant-b');
    });

    expect(mocks.rawSetActiveVariantId).toHaveBeenCalledWith('variant-b');
    expect(result.current.intendedActiveVariantIdRef.current).toBe('variant-b');
  });

  it('updates the intended variant ref when the active variant changes externally', () => {
    const { result, rerender } = renderHook(() =>
      useSharedLightboxVariantState({
        media: { id: 'media-1' } as never,
        variantFetchGenerationId: 'gen-1',
        initialVariantId: 'variant-a',
        isFormOnlyMode: false,
        selectedProjectId: 'project-1',
      }),
    );

    expect(result.current.intendedActiveVariantIdRef.current).toBe('variant-a');

    activeVariantState = { id: 'variant-c' };
    rerender();

    expect(result.current.intendedActiveVariantIdRef.current).toBe('variant-c');
    expect(result.current.primaryVariant).toEqual({ id: 'variant-a' });
    expect(result.current.refetchVariants).toBe(mocks.refetchVariants);
  });
});
