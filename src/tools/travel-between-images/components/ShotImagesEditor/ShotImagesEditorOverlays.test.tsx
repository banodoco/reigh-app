// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorOverlays } from './ShotImagesEditorOverlays';

vi.mock('@/domains/media-lightbox/MediaLightbox', () => ({
  MediaLightbox: ({
    shotId,
    readOnly,
    onClose,
  }: {
    shotId: string;
    readOnly: boolean;
    onClose: () => void;
  }) => (
    <div data-testid="media-lightbox">
      <span>{shotId}</span>
      <span>{String(readOnly)}</span>
      <button type="button" onClick={onClose}>
        close-lightbox
      </button>
    </div>
  ),
}));

vi.mock('./components/PreviewTogetherDialog', () => ({
  PreviewTogetherDialog: ({
    isOpen,
    initialPairIndex,
    onOpenChange,
    onOpenInLightbox,
  }: {
    isOpen: boolean;
    initialPairIndex?: number | null;
    onOpenChange: (open: boolean) => void;
    onOpenInLightbox?: (segmentIndex: number) => void;
  }) => (
    <div data-testid="preview-dialog">
      <span>{String(isOpen)}</span>
      <span>{String(initialPairIndex)}</span>
      <button type="button" onClick={() => onOpenChange(false)}>
        close-preview
      </button>
      <button type="button" onClick={() => onOpenInLightbox?.(2)}>
        open-pair-2
      </button>
    </div>
  ),
}));

describe('EditorOverlays', () => {
  it('renders overlay state, lightbox interactions, and preview handoff callbacks', () => {
    const setSegmentSlotLightboxIndex = vi.fn();
    const setIsPreviewTogetherOpen = vi.fn();
    const setPreviewInitialPairIndex = vi.fn();
    const handlePairClick = vi.fn();

    const { container } = render(
      <EditorOverlays
        componentProps={{
          readOnly: true,
          selectedShotId: 'shot-1',
          projectAspectRatio: '16:9',
          audioUrl: 'audio.mp3',
        } as never}
        mode={{
          transitionOverlayRef: { current: null },
          segmentSlot: {
            pendingImageToOpen: 'image-1',
            segmentSlotModeData: { segmentVideo: { id: 'video-1' } },
            setSegmentSlotLightboxIndex,
            handlePairClick,
          },
          preview: {
            isPreviewTogetherOpen: true,
            setIsPreviewTogetherOpen,
            previewableSegments: [{ id: 'segment-1' }],
          },
          previewInitialPairIndex: 1,
          setPreviewInitialPairIndex,
        } as never}
      />,
    );

    expect(container.querySelector('[aria-hidden="true"]')).toHaveStyle({
      opacity: '1',
      display: 'block',
    });
    expect(screen.getByTestId('media-lightbox')).toHaveTextContent('shot-1');
    expect(screen.getByTestId('media-lightbox')).toHaveTextContent('true');
    expect(screen.getByTestId('preview-dialog')).toHaveTextContent('true');
    expect(screen.getByTestId('preview-dialog')).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'close-lightbox' }));
    fireEvent.click(screen.getByRole('button', { name: 'close-preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'open-pair-2' }));

    expect(setSegmentSlotLightboxIndex).toHaveBeenCalledWith(null);
    expect(setIsPreviewTogetherOpen).toHaveBeenNthCalledWith(1, false);
    expect(setPreviewInitialPairIndex).toHaveBeenCalledWith(null);
    expect(setIsPreviewTogetherOpen).toHaveBeenNthCalledWith(2, false);
    expect(handlePairClick).toHaveBeenCalledWith(2);
  });
});
