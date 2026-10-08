import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { MediaLightbox } from './MediaLightbox';

vi.mock('./ImageLightbox', () => ({ ImageLightbox: () => <div>Image lightbox</div> }));
vi.mock('./VideoLightbox', () => ({ VideoLightbox: () => <div>Video lightbox</div> }));

describe('audio media lightbox', () => {
  it('releases the audio dialog when navigating to image media', async () => {
    function GalleryLightbox() {
      const [type, setType] = useState('audio');
      return <MediaLightbox
        media={{ id: type, type, location: 'sha256:object' }}
        onClose={vi.fn()}
        navigation={{ showNavigation: true, hasNext: true, onNext: () => setType('image') }}
      />;
    }
    render(<GalleryLightbox />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByText('Image lightbox')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('[data-dialog-backdrop]')).toBeNull();
    expect(document.body.style.pointerEvents).not.toBe('none');
  });

  it.each([{ type: 'audio' }, { contentType: 'audio/wav' }])('routes audio through native playback with gallery navigation: %j', async (mediaType) => {
    const onClose = vi.fn();
    const onNext = vi.fn();
    render(<MediaLightbox
      media={{ id: 'audio-1', name: 'Soundtrack', location: 'sha256:audio-object', ...mediaType }}
      onClose={onClose}
      navigation={{ showNavigation: true, hasNext: true, hasPrevious: false, onNext }}
      customOverlay={<div>Local media permission</div>}
    />);
    const audio = screen.getByLabelText('Soundtrack', { selector: 'audio' });
    expect(audio.tagName).toBe('AUDIO');
    expect(audio).toHaveAttribute('controls');
    expect(audio).toHaveAttribute('src', '/api/astrid/v1/objects/sha256%3Aaudio-object');
    expect(screen.queryByText('Image lightbox')).toBeNull();
    expect(screen.queryByText('Video lightbox')).toBeNull();
    expect(screen.getByText('Local media permission')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(onNext).toHaveBeenCalledOnce());
    expect(screen.getByRole('link', { name: 'Download audio' })).toHaveAttribute('href', '/api/astrid/v1/objects/sha256%3Aaudio-object');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
});
