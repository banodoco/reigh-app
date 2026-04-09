import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSegmentOutputStrip } from './useSegmentOutputStrip';

const setLightboxIndex = vi.fn();

vi.mock('@/shared/hooks/sourceImageChanges/useSourceImageChanges', () => ({
  useSourceImageChanges: () => ({
    hasRecentMismatch: () => false,
  }),
}));

vi.mock('@/shared/hooks/variants/useMarkVariantViewed', () => ({
  useMarkVariantViewed: () => ({
    markAllViewed: vi.fn(),
  }),
}));

vi.mock('./useSegmentDeletion', () => ({
  useSegmentDeletion: () => ({
    deletingSegmentId: null,
    handleDeleteSegment: vi.fn(),
  }),
}));

vi.mock('./useSegmentScrubbing', () => ({
  useSegmentScrubbing: () => ({
    previewVideoRef: { current: null },
    stripContainerRef: { current: null },
    isMobile: false,
    activeScrubbingIndex: null,
    activeSegmentSlot: null,
    activeSegmentVideoUrl: null,
    scrubbing: {
      containerRef: undefined,
      containerProps: undefined,
      progress: undefined,
    },
    previewPosition: { x: 0, y: 0 },
    previewDimensions: { width: 0, height: 0 },
    clampedPreviewX: 0,
    handleScrubbingStart: vi.fn(),
    clearScrubbing: vi.fn(),
  }),
}));

vi.mock('./useSegmentLightbox', () => ({
  useSegmentLightbox: () => ({
    lightboxIndex: null,
    setLightboxIndex,
    lightboxMedia: null,
    lightboxCurrentSegmentImages: null,
    lightboxCurrentFrameCount: null,
    currentLightboxMedia: null,
    childSlotIndices: [],
    handleLightboxNext: vi.fn(),
    handleLightboxPrev: vi.fn(),
    handleLightboxClose: vi.fn(),
  }),
}));

describe('useSegmentOutputStrip', () => {
  it('opens pair settings for the displayed pair index when a child slot has a stale raw index', () => {
    const onOpenPairSettings = vi.fn();

    const { result } = renderHook(() => useSegmentOutputStrip({
      shotId: 'shot-1',
      projectAspectRatio: '16:9',
      containerWidth: 1000,
      fullMin: 0,
      fullRange: 20,
      pairInfo: [
        { index: 0, startId: 'img-a', endId: 'img-b', startFrame: 0, endFrame: 10, frames: 10 },
        { index: 1, startId: 'img-b', endId: 'img-c', startFrame: 10, endFrame: 20, frames: 10 },
      ],
      rawSegmentSlots: [
        {
          type: 'child',
          index: 0,
          pairShotGenerationId: 'img-b',
          child: { id: 'segment-b', location: 'segment-b.mp4' },
        },
      ] as never,
      readOnly: false,
    }));

    const displayedSlot = result.current.positionedSlots[1]?.slot;
    expect(displayedSlot?.type).toBe('child');

    result.current.handleSegmentClick(displayedSlot!, 1, onOpenPairSettings);

    expect(onOpenPairSettings).toHaveBeenCalledWith(1);
  });
});
