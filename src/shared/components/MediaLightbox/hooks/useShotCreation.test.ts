import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationRow } from '@/domains/generation/types';

const { mockUseQuickShotCreate, mockGetGenerationId } = vi.hoisted(() => ({
  mockUseQuickShotCreate: vi.fn(),
  mockGetGenerationId: vi.fn(),
}));

vi.mock('@/shared/hooks/useQuickShotCreate', () => ({
  useQuickShotCreate: mockUseQuickShotCreate,
}));

vi.mock('@/shared/lib/mediaTypeHelpers', () => ({
  getGenerationId: mockGetGenerationId,
}));

import { useShotCreation } from './useShotCreation';

const mediaFixture = { id: 'shot-generation-id', generation_id: 'generation-id' } as GenerationRow;
const quickCreateFixture = {
  isCreatingShot: false,
  quickCreateSuccess: {
    isSuccessful: true,
    shotId: 'shot-2',
    shotName: 'Generated Shot',
  },
  handleQuickCreateAndAdd: vi.fn().mockResolvedValue(undefined),
  clearQuickCreateSuccess: vi.fn(),
};

describe('MediaLightbox useShotCreation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGenerationId.mockReturnValue('canonical-generation-id');
    mockUseQuickShotCreate.mockReturnValue(quickCreateFixture);
  });

  it('normalizes generation id before delegating to useQuickShotCreate', () => {
    const onShotChange = vi.fn();
    const onClose = vi.fn();
    const allShots = [{ id: 'shot-2', name: 'Shot 2' }];

    renderHook(() =>
      useShotCreation({
        media: mediaFixture,
        selectedProjectId: 'project-1',
        allShots,
        onClose,
        onShotChange,
      }),
    );

    expect(mockGetGenerationId).toHaveBeenCalledWith(mediaFixture);
    expect(mockUseQuickShotCreate).toHaveBeenCalledWith({
      generationId: 'canonical-generation-id',
      shots: allShots,
      onShotChange,
      onClose: undefined,
    });
  });

  it('navigates to an existing shot and clears success state', () => {
    const clearQuickCreateSuccess = vi.fn();
    mockUseQuickShotCreate.mockReturnValue({
      ...quickCreateFixture,
      clearQuickCreateSuccess,
    });

    const onNavigateToShot = vi.fn();
    const onClose = vi.fn();

    const { result } = renderHook(() =>
      useShotCreation({
        media: mediaFixture,
        selectedProjectId: 'project-1',
        allShots: [{ id: 'shot-2', name: 'Shot 2' }],
        onClose,
        onNavigateToShot,
      }),
    );

    act(() => {
      result.current.handleQuickCreateSuccess();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onNavigateToShot).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'shot-2',
        name: 'Shot 2',
        images: [],
        position: 0,
      }),
      { isNewlyCreated: true },
    );
    expect(clearQuickCreateSuccess).toHaveBeenCalledTimes(1);
  });

  it('falls back to quick-create payload when shot is not yet in list', () => {
    const onNavigateToShot = vi.fn();

    const { result } = renderHook(() =>
      useShotCreation({
        media: mediaFixture,
        selectedProjectId: 'project-1',
        allShots: [],
        onClose: vi.fn(),
        onNavigateToShot,
      }),
    );

    act(() => {
      result.current.handleQuickCreateSuccess();
    });

    expect(onNavigateToShot).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'shot-2',
        name: 'Generated Shot',
        images: [],
        position: 0,
      }),
      { isNewlyCreated: true },
    );
  });
});
