import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimelineControls } from './TimelineControls';

const zoomControlsSpy = vi.fn();
const addAudioButtonSpy = vi.fn();
const guidanceVideoControlsSpy = vi.fn();
const bottomControlsSpy = vi.fn();

vi.mock('./ZoomControls', () => ({
  ZoomControls: (props: unknown) => {
    zoomControlsSpy(props);
    return <div data-testid="zoom-controls" />;
  },
}));

vi.mock('./AddAudioButton', () => ({
  AddAudioButton: (props: unknown) => {
    addAudioButtonSpy(props);
    return <div data-testid="add-audio-button" />;
  },
}));

vi.mock('./GuidanceVideoControls', () => ({
  GuidanceVideoControls: (props: unknown) => {
    guidanceVideoControlsSpy(props);
    return <div data-testid="guidance-video-controls" />;
  },
}));

vi.mock('./TimelineBottomControls', () => ({
  TimelineBottomControls: (props: unknown) => {
    bottomControlsSpy(props);
    return <div data-testid="timeline-bottom-controls" />;
  },
}));

function buildProps(overrides: Partial<React.ComponentProps<typeof TimelineControls>> = {}): React.ComponentProps<typeof TimelineControls> {
  return {
    shotId: 'shot-1',
    projectId: 'project-1',
    readOnly: false,
    hasNoImages: false,
    zoomLevel: 1,
    fullMax: 120,
    audioUrl: null,
    onAudioChange: vi.fn(),
    primaryStructureVideoPath: null,
    primaryStructureVideoType: 'flow',
    primaryStructureVideoTreatment: 'adjust',
    primaryStructureVideoMotionStrength: 1,
    structureVideos: undefined,
    onAddStructureVideo: vi.fn(),
    onUpdateStructureVideo: vi.fn(),
    onPrimaryStructureVideoInputChange: vi.fn(),
    onShowVideoBrowser: vi.fn(),
    isUploadingStructureVideo: false,
    setIsUploadingStructureVideo: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onZoomReset: vi.fn(),
    onZoomToStart: vi.fn(),
    resetGap: 8,
    setResetGap: vi.fn(),
    maxGap: 24,
    onReset: vi.fn(),
    onFileDrop: vi.fn(async () => undefined),
    isUploadingImage: false,
    uploadProgress: 0,
    pushMode: false,
    showDragHint: false,
    ...overrides,
  };
}

describe('TimelineControls', () => {
  beforeEach(() => {
    zoomControlsSpy.mockClear();
    addAudioButtonSpy.mockClear();
    guidanceVideoControlsSpy.mockClear();
    bottomControlsSpy.mockClear();
  });

  it('renders top controls and bottom controls when timeline controls are enabled', () => {
    render(<TimelineControls {...buildProps()} />);

    expect(screen.getByTestId('zoom-controls')).toBeInTheDocument();
    expect(screen.getByTestId('add-audio-button')).toBeInTheDocument();
    expect(screen.getByTestId('guidance-video-controls')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-bottom-controls')).toBeInTheDocument();

    expect(zoomControlsSpy).toHaveBeenCalledWith(expect.objectContaining({ zoomLevel: 1, hasNoImages: false }));
    expect(bottomControlsSpy).toHaveBeenCalledWith(expect.objectContaining({ maxGap: 24, resetGap: 8 }));
  });

  it('renders only bottom controls when top controls gate is not satisfied', () => {
    render(
      <TimelineControls
        {...buildProps({
          readOnly: true,
          projectId: null,
          primaryStructureVideoPath: null,
        })}
      />,
    );

    expect(screen.queryByTestId('zoom-controls')).not.toBeInTheDocument();
    expect(screen.queryByTestId('add-audio-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('guidance-video-controls')).not.toBeInTheDocument();
    expect(screen.getByTestId('timeline-bottom-controls')).toBeInTheDocument();
  });

  it('suppresses guidance controls when only a primary path is present and no structure list is provided', () => {
    render(
      <TimelineControls
        {...buildProps({
          audioUrl: 'https://cdn.example.com/audio.mp3',
          primaryStructureVideoPath: '/videos/guide.mp4',
          structureVideos: undefined,
        })}
      />,
    );

    expect(screen.getByTestId('zoom-controls')).toBeInTheDocument();
    expect(screen.queryByTestId('add-audio-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('guidance-video-controls')).not.toBeInTheDocument();
    expect(screen.getByTestId('timeline-bottom-controls')).toBeInTheDocument();
  });
});
