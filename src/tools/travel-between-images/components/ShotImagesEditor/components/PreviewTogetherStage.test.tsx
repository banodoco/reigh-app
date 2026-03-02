import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PreviewTogetherStage } from './PreviewTogetherStage';
import type { PreviewSegment } from './PreviewTogetherTypes';

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    className,
    title,
  }: {
    children: React.ReactNode;
    onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
    className?: string;
    title?: string;
  }) => {
    let testId = 'ui-button';
    if (title === 'Open in lightbox') testId = 'open-in-lightbox';
    if (className?.includes('left-3 top-1/2')) testId = 'navigate-prev';
    if (className?.includes('right-3 top-1/2')) testId = 'navigate-next';
    return (
      <button type="button" data-testid={testId} onClick={onClick} title={title}>
        {children}
      </button>
    );
  },
}));

vi.mock('@/shared/components/ui/skeleton', () => ({
  Skeleton: () => <div data-testid="stage-skeleton" />,
}));

function buildSegment(overrides: Partial<PreviewSegment> = {}): PreviewSegment {
  return {
    hasVideo: true,
    videoUrl: 'https://cdn.example.com/segment.mp4',
    thumbUrl: 'https://cdn.example.com/segment.jpg',
    startImageUrl: 'https://cdn.example.com/start.jpg',
    endImageUrl: 'https://cdn.example.com/end.jpg',
    index: 3,
    durationFromFrames: 5,
    ...overrides,
  };
}

function buildProps(overrides: Partial<React.ComponentProps<typeof PreviewTogetherStage>> = {}): React.ComponentProps<typeof PreviewTogetherStage> {
  return {
    currentSegment: buildSegment(),
    previewableSegments: [buildSegment(), buildSegment({ index: 4 })],
    previewAspectStyle: { width: 640, height: 360 },
    isPreviewVideoLoading: false,
    activeVideoSlot: 'A',
    previewVideoRef: { current: null },
    previewVideoRefB: { current: null },
    previewAudioRef: { current: null },
    audioUrl: 'https://cdn.example.com/audio.mp3',
    onOpenInLightbox: vi.fn(),
    crossfadeProgress: 0.25,
    previewIsPlaying: true,
    previewCurrentTime: 65,
    previewDuration: 125,
    isAudioEnabled: true,
    onPlayPause: vi.fn(),
    onNavigate: vi.fn(),
    createVideoHandlers: vi.fn(() => ({
      onClick: vi.fn(),
      onPlay: vi.fn(),
      onPause: vi.fn(),
      onTimeUpdate: vi.fn(),
      onSeeked: vi.fn(),
      onLoadedMetadata: vi.fn(),
      onEnded: vi.fn(),
    })),
    onToggleAudio: vi.fn(),
    onSeek: vi.fn(),
    ...overrides,
  };
}

describe('PreviewTogetherStage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders video stage shell and routes lightbox/navigation actions', () => {
    const props = buildProps({ isPreviewVideoLoading: true });
    const { container } = render(<PreviewTogetherStage {...props} />);

    expect(screen.getByTestId('stage-skeleton')).toBeInTheDocument();
    expect(container.querySelectorAll('video')).toHaveLength(2);
    expect(container.querySelector('audio')).toBeTruthy();

    fireEvent.click(screen.getByTestId('open-in-lightbox'));
    expect(props.onOpenInLightbox).toHaveBeenCalledWith(3);

    fireEvent.click(screen.getByTestId('navigate-prev'));
    fireEvent.click(screen.getByTestId('navigate-next'));
    expect(props.onNavigate).toHaveBeenCalledWith('prev');
    expect(props.onNavigate).toHaveBeenCalledWith('next');

    expect(props.createVideoHandlers).toHaveBeenCalledWith('A');
    expect(props.createVideoHandlers).toHaveBeenCalledWith('B');
  });

  it('renders crossfade mode for image-only segments and plays on click', () => {
    const props = buildProps({
      currentSegment: buildSegment({
        hasVideo: false,
        videoUrl: null,
        startImageUrl: 'https://cdn.example.com/start-only.jpg',
        endImageUrl: 'https://cdn.example.com/end-only.jpg',
      }),
      previewIsPlaying: false,
      audioUrl: null,
      previewableSegments: [buildSegment({ hasVideo: false, videoUrl: null })],
    });

    render(<PreviewTogetherStage {...props} />);

    expect(screen.getByText('Crossfade (no video)')).toBeInTheDocument();
    fireEvent.click(screen.getByAltText('Start'));
    expect(props.onPlayPause).toHaveBeenCalledTimes(1);
  });

  it('wires playback controls, audio toggle, time formatting, and seek input', () => {
    const props = buildProps({
      previewableSegments: [buildSegment()],
      onOpenInLightbox: undefined,
    });

    render(<PreviewTogetherStage {...props} />);

    expect(screen.getByText('1:05 / 2:05')).toBeInTheDocument();

    const playPauseButton = screen.getAllByRole('button')[0];
    fireEvent.click(playPauseButton);
    expect(props.onPlayPause).toHaveBeenCalledTimes(1);

    const audioButton = screen.getByTitle('Mute audio');
    fireEvent.click(audioButton);
    expect(props.onToggleAudio).toHaveBeenCalledTimes(1);

    const seekInput = screen.getByRole('slider');
    fireEvent.change(seekInput, { target: { value: '42.5' } });
    expect(props.onSeek).toHaveBeenCalledWith(42.5);
  });
});
