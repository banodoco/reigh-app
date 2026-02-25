import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HoverScrubVideo from './HoverScrubVideo';

const {
  handleErrorMock,
  setVideoElementMock,
  resetMock,
  onLoadedMetadataMock,
  onMouseMoveMock,
  onMouseEnterMock,
  onMouseLeaveMock,
} = vi.hoisted(() => ({
  handleErrorMock: vi.fn(),
  setVideoElementMock: vi.fn(),
  resetMock: vi.fn(),
  onLoadedMetadataMock: vi.fn(),
  onMouseMoveMock: vi.fn(),
  onMouseEnterMock: vi.fn(),
  onMouseLeaveMock: vi.fn(),
}));

vi.mock('@/shared/hooks/mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/shared/hooks/useVideoScrubbing', () => ({
  useVideoScrubbing: () => ({
    containerRef: { current: null },
    containerProps: {
      onMouseMove: onMouseMoveMock,
      onMouseEnter: onMouseEnterMock,
      onMouseLeave: onMouseLeaveMock,
    },
    videoRef: { current: null },
    videoProps: { onLoadedMetadata: onLoadedMetadataMock },
    progress: 0,
    currentTime: 0,
    duration: 12,
    scrubberPosition: null,
    scrubberVisible: false,
    isHovering: false,
    isPlaying: false,
    setVideoElement: setVideoElementMock,
    setDuration: vi.fn(),
    seekToProgress: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    reset: resetMock,
  }),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: handleErrorMock,
}));

describe('HoverScrubVideo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a playable video element for a valid source', () => {
    const { container } = render(
      <HoverScrubVideo
        src="https://example.com/video.mp4"
        poster="https://example.com/poster.jpg"
      />,
    );

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.getAttribute('src')).toContain('https://example.com/video.mp4');
    expect(video?.getAttribute('poster')).toContain('https://example.com/poster.jpg');
  });

  it('does not set video src when source is empty', () => {
    const { container } = render(<HoverScrubVideo src="" />);
    const video = container.querySelector('video');
    expect(video?.getAttribute('src')).toBeNull();
  });

  it('shows click-to-activate overlay and dismisses it on click', () => {
    render(
      <HoverScrubVideo
        src="https://example.com/video.mp4"
        posterOnlyUntilClick
      />,
    );

    expect(screen.getByText('▶')).toBeInTheDocument();
    fireEvent.click(screen.getByText('▶'));
    expect(screen.queryByText('▶')).not.toBeInTheDocument();
  });

  it('reports media errors through shared handler and callback', () => {
    const onVideoError = vi.fn();
    const { container } = render(
      <HoverScrubVideo
        src="https://example.com/video.mp4"
        onVideoError={onVideoError}
      />,
    );

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    if (video) {
      fireEvent.error(video);
    }

    expect(handleErrorMock).toHaveBeenCalledTimes(1);
    expect(onVideoError).toHaveBeenCalledTimes(1);
  });
});
