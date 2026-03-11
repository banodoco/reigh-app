// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useShotCreation: vi.fn(),
  useShotPositioning: vi.fn(),
}));

vi.mock('../useShotCreation', () => ({
  useShotCreation: (...args: unknown[]) => mocks.useShotCreation(...args),
}));

vi.mock('../useShotPositioning', () => ({
  useShotPositioning: (...args: unknown[]) => mocks.useShotPositioning(...args),
}));

import { useSharedLightboxShotState } from './useSharedLightboxShotState';

describe('useSharedLightboxShotState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useShotCreation.mockReturnValue({
      isCreatingShot: false,
      quickCreateSuccess: null,
      handleQuickCreateAndAdd: vi.fn(),
      handleVisitCreatedShot: vi.fn(),
    });
    mocks.useShotPositioning.mockReturnValue({
      isAlreadyPositionedInSelectedShot: false,
      isAlreadyAssociatedWithoutPosition: false,
      handleAddToShot: vi.fn(),
      handleAddToShotWithoutPosition: vi.fn(),
    });
  });

  it('falls back to empty shot arrays and normalizes non-boolean position state', () => {
    renderHook(() =>
      useSharedLightboxShotState({
        media: { id: 'media-1' } as never,
        selectedProjectId: 'project-1',
        onClose: vi.fn(),
        shotWorkflow: {
          positionedInSelectedShot: 'yes' as never,
        } as never,
      }),
    );

    expect(mocks.useShotCreation).toHaveBeenCalledWith(
      expect.objectContaining({
        allShots: [],
      }),
    );
    expect(mocks.useShotPositioning).toHaveBeenCalledWith(
      expect.objectContaining({
        allShots: [],
        positionedInSelectedShot: undefined,
      }),
    );
  });

  it('returns the delegated creation and positioning state', () => {
    const handleAddToShot = vi.fn();
    const handleAddToShotWithoutPosition = vi.fn();
    const handleQuickCreateAndAdd = vi.fn();
    const handleVisitCreatedShot = vi.fn();

    mocks.useShotCreation.mockReturnValue({
      isCreatingShot: true,
      quickCreateSuccess: { isSuccessful: true },
      handleQuickCreateAndAdd,
      handleVisitCreatedShot,
    });
    mocks.useShotPositioning.mockReturnValue({
      isAlreadyPositionedInSelectedShot: true,
      isAlreadyAssociatedWithoutPosition: true,
      handleAddToShot,
      handleAddToShotWithoutPosition,
    });

    const { result } = renderHook(() =>
      useSharedLightboxShotState({
        media: { id: 'media-1' } as never,
        selectedProjectId: 'project-1',
        onClose: vi.fn(),
        shotWorkflow: {
          allShots: [{ id: 'shot-1' }],
          selectedShotId: 'shot-1',
          positionedInSelectedShot: true,
        } as never,
      }),
    );

    expect(result.current.selectedShotId).toBe('shot-1');
    expect(result.current.isAlreadyPositionedInSelectedShot).toBe(true);
    expect(result.current.isAlreadyAssociatedWithoutPosition).toBe(true);
    expect(result.current.handleAddToShot).toBe(handleAddToShot);
    expect(result.current.handleAddToShotWithoutPosition).toBe(handleAddToShotWithoutPosition);
    expect(result.current.isCreatingShot).toBe(true);
    expect(result.current.quickCreateSuccess).toEqual({ isSuccessful: true });
    expect(result.current.handleQuickCreateAndAdd).toBe(handleQuickCreateAndAdd);
    expect(result.current.handleVisitCreatedShot).toBe(handleVisitCreatedShot);
  });
});
