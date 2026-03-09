// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationRow } from '@/domains/generation/types';
import { MediaLightbox } from '../MediaLightbox';

const mocks = vi.hoisted(() => ({
  isVideoAny: vi.fn(),
  imageLightbox: vi.fn(),
  videoLightbox: vi.fn(),
}));

vi.mock('@/shared/lib/typeGuards', () => ({
  isVideoAny: (...args: unknown[]) => mocks.isVideoAny(...args),
}));

vi.mock('../ImageLightbox', () => ({
  ImageLightbox: (props: Record<string, unknown>) => {
    mocks.imageLightbox(props);
    return <div data-testid="image-lightbox" />;
  },
}));

vi.mock('../VideoLightbox', () => ({
  VideoLightbox: (props: Record<string, unknown>) => {
    mocks.videoLightbox(props);
    return <div data-testid="video-lightbox" />;
  },
}));

describe('MediaLightbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isVideoAny.mockReturnValue(false);
  });

  it('returns null when no media is provided and no segment slot mode is active', () => {
    const { container } = render(
      <MediaLightbox onClose={vi.fn()} />,
    );

    expect(container.firstChild).toBeNull();
    expect(mocks.imageLightbox).not.toHaveBeenCalled();
    expect(mocks.videoLightbox).not.toHaveBeenCalled();
  });

  it('renders VideoLightbox when segment slot mode is provided', () => {
    const segmentSlotMode = { slot: 'A' };
    render(
      <MediaLightbox
        onClose={vi.fn()}
        media={{ id: 'gen-1' } as unknown as GenerationRow}
        segmentSlotMode={segmentSlotMode as never}
      />,
    );

    expect(screen.getByTestId('video-lightbox')).toBeInTheDocument();
    expect(mocks.videoLightbox).toHaveBeenCalled();
    expect(mocks.isVideoAny).not.toHaveBeenCalled();
  });

  it('routes video media to VideoLightbox', () => {
    mocks.isVideoAny.mockReturnValue(true);
    const media = { id: 'video-gen' } as unknown as GenerationRow;

    render(<MediaLightbox onClose={vi.fn()} media={media} />);

    expect(mocks.isVideoAny).toHaveBeenCalledWith(media);
    expect(screen.getByTestId('video-lightbox')).toBeInTheDocument();
    expect(mocks.imageLightbox).not.toHaveBeenCalled();
  });

  it('routes non-video media to ImageLightbox and forwards image-only props', () => {
    const onNavigateToGeneration = vi.fn();
    const media = { id: 'image-gen' } as unknown as GenerationRow;

    render(
      <MediaLightbox
        onClose={vi.fn()}
        media={media}
        toolTypeOverride="inpainting"
        onNavigateToGeneration={onNavigateToGeneration}
      />,
    );

    expect(screen.getByTestId('image-lightbox')).toBeInTheDocument();
    expect(mocks.imageLightbox).toHaveBeenCalledWith(
      expect.objectContaining({
        media,
        toolTypeOverride: 'inpainting',
        onNavigateToGeneration,
      }),
    );
    expect(mocks.videoLightbox).not.toHaveBeenCalled();
  });
});
