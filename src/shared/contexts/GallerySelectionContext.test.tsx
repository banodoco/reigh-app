// @vitest-environment jsdom

import { useEffect } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  GallerySelectionProvider,
  useGallerySelection,
  useGallerySelectionOptional,
} from './GallerySelectionContext';

function OptionalConsumer() {
  const context = useGallerySelectionOptional();
  return <span data-testid="optional-count">{context?.selectedGalleryIds.size ?? 0}</span>;
}

function SelectionConsumer({ peerClear }: { peerClear?: (() => void) | null } = {}) {
  const {
    selectedGalleryIds,
    selectedGalleryClips,
    gallerySummary,
    selectGalleryItem,
    selectGalleryItems,
    clearGallerySelection,
    registerPeerClear,
  } = useGallerySelection();

  useEffect(() => {
    if (peerClear === undefined) {
      return undefined;
    }

    registerPeerClear(peerClear);
    return () => {
      registerPeerClear(null);
    };
  }, [peerClear, registerPeerClear]);

  return (
    <div>
      <span data-testid="selected-ids">{Array.from(selectedGalleryIds).join(',')}</span>
      <span data-testid="selected-clips">{JSON.stringify(selectedGalleryClips)}</span>
      <span data-testid="summary">{gallerySummary}</span>
      <button
        type="button"
        onClick={() => selectGalleryItem('gen-1', {
          url: 'https://example.com/image-1.png',
          type: 'image/png',
          generationId: 'gen-1',
          variantId: 'variant-1',
        })}
      >
        select-image
      </button>
      <button
        type="button"
        onClick={() => selectGalleryItem('gen-2', {
          url: 'https://example.com/video-1.mp4',
          type: 'video/mp4',
          generationId: 'gen-2',
        }, { toggle: true })}
      >
        toggle-video
      </button>
      <button
        type="button"
        onClick={() => selectGalleryItem('audio-1', {
          url: 'https://example.com/audio-1.mp3',
          type: 'audio/mpeg',
          generationId: 'audio-1',
        })}
      >
        select-audio
      </button>
      <button
        type="button"
        onClick={() => selectGalleryItems([
          {
            id: 'gen-3',
            url: 'https://example.com/image-3.png',
            type: 'image/png',
            generationId: 'gen-3',
          },
          {
            id: 'gen-4',
            url: 'https://example.com/video-4.mp4',
            type: 'video/mp4',
            generationId: 'gen-4',
          },
        ], { append: true })}
      >
        append-batch
      </button>
      <button
        type="button"
        onClick={() => selectGalleryItems([
          {
            id: 'gen-5',
            url: 'https://example.com/image-5.png',
            type: 'image/png',
            generationId: 'gen-5',
          },
          {
            id: 'gen-6',
            url: 'https://example.com/video-6.mp4',
            type: 'video/mp4',
            generationId: 'gen-6',
          },
        ])}
      >
        replace-batch
      </button>
      <button type="button" onClick={clearGallerySelection}>
        clear
      </button>
    </div>
  );
}

describe('GallerySelectionContext', () => {
  it('returns null from the optional hook outside the provider', () => {
    render(<OptionalConsumer />);
    expect(screen.getByTestId('optional-count')).toHaveTextContent('0');
  });

  it('filters out non-image and non-video selections', () => {
    render(
      <GallerySelectionProvider>
        <SelectionConsumer />
      </GallerySelectionProvider>,
    );

    fireEvent.click(screen.getByText('select-audio'));

    expect(screen.getByTestId('selected-ids')).toHaveTextContent('');
    expect(screen.getByTestId('summary')).toHaveTextContent('');
  });

  it('supports replacement, toggled multi-select, batch append, and clearing', () => {
    render(
      <GallerySelectionProvider>
        <SelectionConsumer />
      </GallerySelectionProvider>,
    );

    fireEvent.click(screen.getByText('select-image'));
    expect(screen.getByTestId('selected-ids')).toHaveTextContent('gen-1');
    expect(screen.getByTestId('summary')).toHaveTextContent('attaching 1 image');
    expect(screen.getByTestId('selected-clips')).toHaveTextContent('"variantId":"variant-1"');

    fireEvent.click(screen.getByText('toggle-video'));
    expect(screen.getByTestId('selected-ids')).toHaveTextContent('gen-1,gen-2');
    expect(screen.getByTestId('summary')).toHaveTextContent('attaching 1 image, 1 video');

    fireEvent.click(screen.getByText('append-batch'));
    expect(screen.getByTestId('selected-ids')).toHaveTextContent('gen-1,gen-2,gen-3,gen-4');
    expect(screen.getByTestId('summary')).toHaveTextContent('attaching 2 images, 2 videos');
    expect(screen.getByTestId('selected-clips')).toHaveTextContent('"generationId":"gen-4"');

    fireEvent.click(screen.getByText('toggle-video'));
    expect(screen.getByTestId('selected-ids')).toHaveTextContent('gen-1,gen-3,gen-4');
    expect(screen.getByTestId('summary')).toHaveTextContent('attaching 2 images, 1 video');

    fireEvent.click(screen.getByText('clear'));
    expect(screen.getByTestId('selected-ids')).toHaveTextContent('');
    expect(screen.getByTestId('summary')).toHaveTextContent('');
  });

  it('calls peer clear for non-toggle single selection', () => {
    const peerClear = vi.fn();

    render(
      <GallerySelectionProvider>
        <SelectionConsumer peerClear={peerClear} />
      </GallerySelectionProvider>,
    );

    fireEvent.click(screen.getByText('select-image'));

    expect(peerClear).toHaveBeenCalledTimes(1);
  });

  it('does not call peer clear for toggle single selection', () => {
    const peerClear = vi.fn();

    render(
      <GallerySelectionProvider>
        <SelectionConsumer peerClear={peerClear} />
      </GallerySelectionProvider>,
    );

    fireEvent.click(screen.getByText('toggle-video'));

    expect(peerClear).not.toHaveBeenCalled();
  });

  it('calls peer clear for non-append batch selection', () => {
    const peerClear = vi.fn();

    render(
      <GallerySelectionProvider>
        <SelectionConsumer peerClear={peerClear} />
      </GallerySelectionProvider>,
    );

    fireEvent.click(screen.getByText('replace-batch'));

    expect(peerClear).toHaveBeenCalledTimes(1);
  });

  it('does not call peer clear for append batch selection', () => {
    const peerClear = vi.fn();

    render(
      <GallerySelectionProvider>
        <SelectionConsumer peerClear={peerClear} />
      </GallerySelectionProvider>,
    );

    fireEvent.click(screen.getByText('append-batch'));

    expect(peerClear).not.toHaveBeenCalled();
  });

  it('allows non-toggle selection when no peer clear is registered', () => {
    render(
      <GallerySelectionProvider>
        <SelectionConsumer />
      </GallerySelectionProvider>,
    );

    expect(() => {
      fireEvent.click(screen.getByText('select-image'));
    }).not.toThrow();
    expect(screen.getByTestId('selected-ids')).toHaveTextContent('gen-1');
  });
});
