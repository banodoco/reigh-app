import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import MediaLightbox, { type MediaLightboxProps } from '../MediaLightbox';
import type { GenerationRow } from '@/domains/generation/types';
import type { SegmentSlotModeData } from '../types';
import { isVideoAny } from '@/shared/lib/typeGuards';

const imageLightboxSpy = vi.fn();
const videoLightboxSpy = vi.fn();

vi.mock('../ImageLightbox', () => ({
  ImageLightbox: (props: unknown) => {
    imageLightboxSpy(props);
    return <div data-testid="image-lightbox" />;
  },
}));

vi.mock('../VideoLightbox', () => ({
  VideoLightbox: (props: unknown) => {
    videoLightboxSpy(props);
    return <div data-testid="video-lightbox" />;
  },
}));

vi.mock('@/shared/lib/typeGuards', () => ({
  isVideoAny: vi.fn(),
}));

const isVideoAnyMock = vi.mocked(isVideoAny);

function buildProps(overrides: Partial<MediaLightboxProps> = {}): MediaLightboxProps {
  return {
    onClose: vi.fn(),
    ...overrides,
  };
}

function buildMedia(overrides: Partial<GenerationRow> = {}): GenerationRow {
  return {
    id: 'gen-1',
    ...overrides,
  } as GenerationRow;
}

describe('MediaLightbox', () => {
  beforeEach(() => {
    imageLightboxSpy.mockClear();
    videoLightboxSpy.mockClear();
    isVideoAnyMock.mockReset();
  });

  it('renders video lightbox for segment slot mode even without media', () => {
    render(
      <MediaLightbox
        {...buildProps({
          segmentSlotMode: { slot: 'start' } as unknown as SegmentSlotModeData,
        })}
      />
    );

    expect(screen.getByTestId('video-lightbox')).toBeInTheDocument();
    expect(videoLightboxSpy).toHaveBeenCalledTimes(1);
    expect(imageLightboxSpy).not.toHaveBeenCalled();
    expect(isVideoAnyMock).not.toHaveBeenCalled();
  });

  it('returns null when media is absent and segment slot mode is not enabled', () => {
    const { container } = render(<MediaLightbox {...buildProps()} />);

    expect(container.firstChild).toBeNull();
    expect(videoLightboxSpy).not.toHaveBeenCalled();
    expect(imageLightboxSpy).not.toHaveBeenCalled();
    expect(isVideoAnyMock).not.toHaveBeenCalled();
  });

  it('routes to video lightbox for video media', () => {
    isVideoAnyMock.mockReturnValue(true);
    const media = buildMedia();

    render(<MediaLightbox {...buildProps({ media })} />);

    expect(screen.getByTestId('video-lightbox')).toBeInTheDocument();
    expect(videoLightboxSpy).toHaveBeenCalledTimes(1);
    expect(videoLightboxSpy.mock.calls[0]?.[0]).toMatchObject({ media });
    expect(imageLightboxSpy).not.toHaveBeenCalled();
    expect(isVideoAnyMock).toHaveBeenCalledWith(media);
  });

  it('routes to image lightbox for non-video media', () => {
    isVideoAnyMock.mockReturnValue(false);
    const media = buildMedia();

    render(<MediaLightbox {...buildProps({ media })} />);

    expect(screen.getByTestId('image-lightbox')).toBeInTheDocument();
    expect(imageLightboxSpy).toHaveBeenCalledTimes(1);
    expect(imageLightboxSpy.mock.calls[0]?.[0]).toMatchObject({ media });
    expect(videoLightboxSpy).not.toHaveBeenCalled();
    expect(isVideoAnyMock).toHaveBeenCalledWith(media);
  });
});
