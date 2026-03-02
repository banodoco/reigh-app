import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../DropIndicator', () => ({
  default: ({ isVisible }: { isVisible: boolean }) => (
    <div data-testid="drop-indicator" data-visible={String(isVisible)} />
  ),
}));

vi.mock('./PendingFrameMarker', () => ({
  PendingFrameMarker: ({ pendingFrame }: { pendingFrame: number | null }) => (
    <div data-testid="pending-frame-marker" data-frame={pendingFrame ?? 'none'} />
  ),
}));

vi.mock('./TimelineSkeletonItem', () => ({
  TimelineSkeletonItem: ({ framePosition }: { framePosition: number }) => (
    <div data-testid="timeline-skeleton-item" data-frame={framePosition} />
  ),
}));

import { DragLayer } from './DragLayer';

describe('DragLayer', () => {
  function renderLayer(overrides?: Partial<React.ComponentProps<typeof DragLayer>>) {
    return render(
      <DragLayer
        isFileOver={false}
        dropTargetFrame={null}
        fullMin={0}
        fullRange={100}
        containerWidth={400}
        dragType={null}
        activePendingFrame={null}
        pendingDropFrame={null}
        pendingDuplicateFrame={null}
        pendingExternalAddFrame={null}
        isUploadingImage={false}
        isInternalDropProcessing={false}
        projectAspectRatio="16:9"
        imagesLength={0}
        {...overrides}
      />,
    );
  }

  it('always renders drop indicator and pending frame marker', () => {
    renderLayer({ isFileOver: true, activePendingFrame: 12 });

    expect(screen.getByTestId('drop-indicator')).toHaveAttribute('data-visible', 'true');
    expect(screen.getByTestId('pending-frame-marker')).toHaveAttribute('data-frame', '12');
  });

  it('renders skeleton for pending drop while uploading or processing', () => {
    renderLayer({
      isUploadingImage: true,
      pendingDropFrame: 33,
    });

    const skeletons = screen.getAllByTestId('timeline-skeleton-item');
    expect(skeletons).toHaveLength(1);
    expect(skeletons[0]).toHaveAttribute('data-frame', '33');
  });

  it('renders duplicate and external-add skeleton markers independently', () => {
    renderLayer({
      pendingDuplicateFrame: 44,
      pendingExternalAddFrame: 55,
    });

    const skeletons = screen.getAllByTestId('timeline-skeleton-item');
    expect(skeletons).toHaveLength(2);
    expect(skeletons[0]).toHaveAttribute('data-frame', '44');
    expect(skeletons[1]).toHaveAttribute('data-frame', '55');
  });
});
