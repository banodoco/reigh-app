import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/domains/media-lightbox/MediaLightbox', () => ({
  MediaLightbox: () => <div data-testid="segment-lightbox" />,
}));

vi.mock('./ShotImageManagerDesktop.tsx', () => ({
  ShotImageManagerDesktop: () => <div data-testid="desktop-manager" />,
}));

vi.mock('./ShotImageManagerMobileWrapper.tsx', () => ({
  ShotImageManagerMobileWrapper: () => <div data-testid="mobile-manager" />,
}));

vi.mock('./components/EmptyState', () => ({
  EmptyState: () => <div data-testid="empty-state" />,
}));

import {
  ShotImageManagerContent,
  useSegmentLightboxState,
} from './ShotImageManagerContainer';

function createContentState() {
  const segmentLightbox = {
    segmentLightboxIndex: null,
    currentSegmentSlot: null,
    currentSegmentMedia: null,
    segmentChildSlotIndices: [],
    handleSegmentClick: vi.fn(),
    handleSegmentLightboxNext: vi.fn(),
    handleSegmentLightboxPrev: vi.fn(),
    closeSegmentLightbox: vi.fn(),
  };

  return {
    selectionOrder: {
      selection: {},
      dragAndDrop: {},
      batchOps: {},
      mobileGestures: {},
      optimistic: {},
      getFramePosition: vi.fn(),
    },
    navigation: {
      lightbox: {},
      externalGens: {},
      shotSelector: {
        lightboxSelectedShotId: 'shot-1',
        setLightboxSelectedShotId: vi.fn(),
      },
    },
    segments: {
      segmentSlots: [],
      selectedParentId: null,
      hasPendingTask: vi.fn(() => false),
      segmentLightbox,
    },
  };
}

function createProps(overrides: Record<string, unknown> = {}) {
  return {
    images: [{ id: 'img-1', generation_id: 'gen-1' }],
    onImageDelete: vi.fn(),
    onImageReorder: vi.fn(),
    generationMode: 'batch',
    shotId: 'shot-1',
    selectedShotId: 'shot-1',
    ...overrides,
  };
}

describe('ShotImageManagerContainer seams', () => {
  it('renders the empty-state branch through the extracted content component', () => {
    render(
      <ShotImageManagerContent
        isMobile={false}
        props={createProps({ images: [] }) as never}
        state={createContentState() as never}
      />,
    );

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('renders the mobile branch and segment lightbox through the extracted content component', () => {
    const state = createContentState();
    state.segments.segmentLightbox.currentSegmentMedia = { id: 'segment-1' };
    state.segments.segmentLightbox.currentSegmentSlot = {
      type: 'child',
      child: { id: 'segment-1', location: 'video.mp4' },
      index: 0,
      pairShotGenerationId: 'pair-1',
    };
    state.segments.segmentLightbox.segmentChildSlotIndices = [0, 1];

    render(
      <ShotImageManagerContent
        isMobile
        props={createProps() as never}
        state={state as never}
      />,
    );

    expect(screen.getByTestId('mobile-manager')).toBeInTheDocument();
    expect(screen.getByTestId('segment-lightbox')).toBeInTheDocument();
  });

  it('cycles child segment slots through the extracted lightbox hook', () => {
    const segmentSlots = [
      {
        type: 'child',
        index: 0,
        child: { id: 'child-1', location: 'video-1.mp4' },
        pairShotGenerationId: 'pair-1',
      },
      {
        type: 'pair',
        index: 1,
      },
      {
        type: 'child',
        index: 2,
        child: { id: 'child-2', location: 'video-2.mp4' },
        pairShotGenerationId: 'pair-2',
      },
    ] as never;

    const { result } = renderHook(() => useSegmentLightboxState(segmentSlots));

    act(() => {
      result.current.handleSegmentClick(0);
    });
    expect(result.current.currentSegmentMedia?.id).toBe('child-1');

    act(() => {
      result.current.handleSegmentLightboxNext();
    });
    expect(result.current.currentSegmentMedia?.id).toBe('child-2');

    act(() => {
      result.current.handleSegmentLightboxPrev();
    });
    expect(result.current.currentSegmentMedia?.id).toBe('child-1');
  });
});
