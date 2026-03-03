import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileImageGrid } from './MobileImageGrid';

const mocks = vi.hoisted(() => ({
  ShotBatchItemMobile: vi.fn(() => <div data-testid="shot-batch-item-mobile" />),
  PairPromptIndicator: vi.fn(() => <div data-testid="pair-prompt-indicator" />),
  InlineSegmentVideo: vi.fn(() => <div data-testid="inline-segment-video" />),
  getAspectRatioStyle: vi.fn(() => ({ aspectRatio: '16 / 9' })),
  resolveDuplicateFrame: vi.fn((_image: unknown, index: number) => index * 10),
}));

vi.mock('@/shared/components/ShotImageManager/ShotBatchItemMobile', () => ({
  ShotBatchItemMobile: (props: unknown) => mocks.ShotBatchItemMobile(props),
}));

vi.mock('@/shared/components/ShotImageManager/components/PairPromptIndicator', () => ({
  PairPromptIndicator: (props: unknown) => mocks.PairPromptIndicator(props),
}));

vi.mock('@/shared/components/InlineSegmentVideo', () => ({
  InlineSegmentVideo: (props: unknown) => mocks.InlineSegmentVideo(props),
}));

vi.mock('@/shared/components/ShotImageManager/utils/image-utils', () => ({
  getAspectRatioStyle: (...args: unknown[]) => mocks.getAspectRatioStyle(...args),
  resolveDuplicateFrame: (...args: unknown[]) => mocks.resolveDuplicateFrame(...args),
}));

describe('MobileImageGrid', () => {
  function buildProps(overrides: Partial<React.ComponentProps<typeof MobileImageGrid>> = {}) {
    return {
      images: [
        { id: 'img-1', generation_id: 'gen-1' },
        { id: 'img-2', generation_id: 'gen-2' },
      ] as never,
      layout: {
        mobileGridColsClass: 'grid-cols-2',
        gridColumns: 2,
        projectAspectRatio: '16:9',
        batchVideoFrames: 20,
      },
      selection: {
        selectedIds: ['img-1'],
        isInMoveMode: false,
        wouldActuallyMove: vi.fn(() => true),
      },
      actions: {
        readOnly: false,
        onMobileTap: vi.fn(),
        onDeleteImage: vi.fn(),
        onMoveHere: vi.fn(),
        onOpenLightbox: vi.fn(),
        onInpaintClick: vi.fn(),
        onImageDuplicate: vi.fn(),
        duplicatingImageId: null,
        duplicateSuccessImageId: null,
        onMarkAllViewed: vi.fn(),
      },
      pairing: {
        onPairClick: vi.fn(),
        pairPrompts: {},
        enhancedPrompts: {},
        defaultPrompt: '',
        defaultNegativePrompt: '',
        onClearEnhancedPrompt: vi.fn(),
        pairOverrides: {},
        segmentSlots: [],
        onSegmentClick: vi.fn(),
        hasPendingTask: vi.fn(() => false),
      },
      upload: {
        enabled: true,
        isUploadingImage: false,
        onUpload: vi.fn(),
      },
      ...overrides,
    } as React.ComponentProps<typeof MobileImageGrid>;
  }

  it('renders batch items and move arrows for valid insertion points', () => {
    const props = buildProps();
    render(<MobileImageGrid {...props} />);

    expect(screen.getAllByTestId('shot-batch-item-mobile')).toHaveLength(2);
    expect(mocks.ShotBatchItemMobile).toHaveBeenCalledWith(
      expect.objectContaining({ frameNumber: 0, isSelected: true }),
    );
    expect(mocks.ShotBatchItemMobile).toHaveBeenCalledWith(
      expect.objectContaining({ frameNumber: 10, isSelected: false }),
    );

    fireEvent.click(screen.getByTitle('Move here'));
    fireEvent.click(screen.getByTitle('Move to end'));
    expect(props.actions.onMoveHere).toHaveBeenCalledWith(1);
    expect(props.actions.onMoveHere).toHaveBeenCalledWith(2);
  });

  it('uploads files from add-images input when upload is enabled', () => {
    const onUpload = vi.fn();
    render(<MobileImageGrid {...buildProps({ upload: { enabled: true, isUploadingImage: false, onUpload } })} />);

    const input = document.getElementById('mobile-grid-image-upload') as HTMLInputElement;
    const file = new File(['img'], 'img.png', { type: 'image/png' });

    fireEvent.change(input, {
      target: { files: [file] },
    });

    expect(onUpload).toHaveBeenCalledWith([file]);
    expect(mocks.getAspectRatioStyle).toHaveBeenCalledWith('16:9');
  });
});
