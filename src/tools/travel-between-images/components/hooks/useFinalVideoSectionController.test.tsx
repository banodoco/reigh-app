import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useIsMobile: vi.fn(),
  useSegmentOutputsForShot: vi.fn(),
  useTaskDetails: vi.fn(),
  useVariantBadges: vi.fn(),
  useShareGeneration: vi.fn(),
  useMarkVariantViewed: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock('@/shared/hooks/mobile', () => ({
  useIsMobile: (...args: unknown[]) => mocks.useIsMobile(...args),
}));

vi.mock('@/shared/hooks/segments', () => ({
  useSegmentOutputsForShot: (...args: unknown[]) => mocks.useSegmentOutputsForShot(...args),
}));

vi.mock('@/shared/components/ShotImageManager/hooks/useTaskDetails', () => ({
  useTaskDetails: (...args: unknown[]) => mocks.useTaskDetails(...args),
}));

vi.mock('@/shared/hooks/variants/useVariantBadges', () => ({
  useVariantBadges: (...args: unknown[]) => mocks.useVariantBadges(...args),
}));

vi.mock('@/shared/hooks/useShareGeneration', () => ({
  useShareGeneration: (...args: unknown[]) => mocks.useShareGeneration(...args),
}));

vi.mock('@/shared/hooks/variants/useMarkVariantViewed', () => ({
  useMarkVariantViewed: (...args: unknown[]) => mocks.useMarkVariantViewed(...args),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mocks.useQuery(...args),
}));

import { useFinalVideoSectionController } from './useFinalVideoSectionController';

describe('useFinalVideoSectionController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useIsMobile.mockReturnValue(false);
    mocks.useSegmentOutputsForShot.mockReturnValue({
      parentGenerations: [],
      selectedParentId: null,
      setSelectedParentId: vi.fn(),
      segmentProgress: { completed: 0, total: 0 },
      isLoading: false,
    });
    mocks.useTaskDetails.mockReturnValue({
      taskDetailsData: { id: 'task-details' },
      taskMapping: { taskId: 'task-1' },
      task: { params: { input_images: ['/one.png', '/two.png'] } },
      taskError: null,
    });
    mocks.useVariantBadges.mockReturnValue({
      getBadgeData: vi.fn(() => ({
        derivedCount: 2,
        unviewedVariantCount: 1,
        hasUnviewedVariants: true,
      })),
    });
    mocks.useShareGeneration.mockReturnValue({
      handleShare: vi.fn(),
      isCreatingShare: false,
      shareCopied: false,
      shareSlug: 'share-1',
    });
    mocks.useMarkVariantViewed.mockReturnValue({
      markAllViewed: vi.fn(),
    });
    mocks.useQuery.mockReturnValue({ data: null });
  });

  it('uses the preloaded read-only parent path and exposes derived actions/data', () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useFinalVideoSectionController({
      shotId: 'shot-1',
      projectId: 'project-1',
      onApplySettingsFromTask: vi.fn(),
      getFinalVideoCount: () => 0,
      onDelete,
      readOnly: true,
      preloadedParent: {
        id: 'parent-1',
        location: '/final.mp4',
      } as never,
    }));

    expect(result.current.parentGenerations).toEqual([
      expect.objectContaining({ id: 'parent-1' }),
    ]);
    expect(result.current.selectedParentId).toBe('parent-1');
    expect(result.current.hasFinalOutput).toBe(true);
    expect(result.current.badgeData).toEqual({
      derivedCount: 2,
      unviewedVariantCount: 1,
      hasUnviewedVariants: true,
    });
    expect(result.current.parentVideoRow).toEqual(expect.objectContaining({
      id: 'parent-1',
      type: 'video',
    }));
    expect(result.current.inputImages).toEqual(['/one.png', '/two.png']);

    act(() => {
      result.current.handleMarkAllVariantsViewed();
      result.current.handleDelete();
      result.current.handleLightboxOpen();
      result.current.handleLightboxClose();
    });

    expect(mocks.useMarkVariantViewed.mock.results[0]?.value.markAllViewed).toHaveBeenCalledWith('parent-1');
    expect(onDelete).toHaveBeenCalledWith('parent-1');
    expect(result.current.isLightboxOpen).toBe(false);
    expect(result.current.shouldShowSkeleton).toBe(false);
  });

  it('shows the final-video skeleton when outputs are expected but no parent is selected yet', () => {
    const setSelectedParentId = vi.fn();
    mocks.useSegmentOutputsForShot.mockReturnValueOnce({
      parentGenerations: [
        { id: 'parent-2', location: null },
      ],
      selectedParentId: null,
      setSelectedParentId,
      segmentProgress: { completed: 0, total: 1 },
      isLoading: false,
    });
    mocks.useQuery.mockReturnValueOnce({ data: { id: 'join-task-1' } });

    const { result } = renderHook(() => useFinalVideoSectionController({
      shotId: 'shot-1',
      projectId: 'project-1',
      onApplySettingsFromTask: vi.fn(),
      getFinalVideoCount: () => 1,
      readOnly: false,
    }));

    expect(result.current.shouldShowSkeleton).toBe(true);
    expect(result.current.hasActiveJoinTask).toBe(true);

    act(() => {
      result.current.handleOutputSelect('parent-2');
    });

    expect(setSelectedParentId).toHaveBeenCalledWith('parent-2');
  });
});
