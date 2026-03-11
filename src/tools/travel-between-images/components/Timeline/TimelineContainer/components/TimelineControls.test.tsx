import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineControls } from './TimelineControls';

const captures = vi.hoisted(() => ({
  guidanceProps: null as unknown,
  bottomProps: null as unknown,
  zoomProps: null as unknown,
}));

vi.mock('./AddAudioButton', () => ({
  AddAudioButton: ({
    shotId,
    projectId,
    onAudioChange,
  }: {
    shotId: string;
    projectId: string | null;
    onAudioChange?: (audioUrl: string | null, metadata: { duration: number } | null) => void;
  }) => (
    <button type="button" onClick={() => onAudioChange?.('audio.mp3', { duration: 12 })}>
      add-audio-{shotId}-{projectId}
    </button>
  ),
}));

vi.mock('./GuidanceVideoControls', () => ({
  GuidanceVideoControls: (props: unknown) => {
    captures.guidanceProps = props;
    return <div data-testid="guidance-video-controls">guidance</div>;
  },
}));

vi.mock('./TimelineBottomControls', () => ({
  TimelineBottomControls: (props: unknown) => {
    captures.bottomProps = props;
    return <div data-testid="timeline-bottom-controls">bottom</div>;
  },
}));

vi.mock('./ZoomControls', () => ({
  ZoomControls: (props: unknown) => {
    captures.zoomProps = props;
    return <div data-testid="zoom-controls">zoom</div>;
  },
}));

describe('TimelineControls', () => {
  beforeEach(() => {
    captures.guidanceProps = null;
    captures.bottomProps = null;
    captures.zoomProps = null;
  });

  function buildProps(overrides: Partial<React.ComponentProps<typeof TimelineControls>> = {}) {
    return {
      timeline: {
        shotId: 'shot-1',
        projectId: 'project-1',
        readOnly: false,
        hasNoImages: false,
        zoomLevel: 1,
        fullMax: 120,
        showDragHint: true,
      },
      audio: {
        audioUrl: null,
        onAudioChange: vi.fn(),
      },
      guidance: {
        primaryStructureVideo: { path: null, treatment: 'adjust', motionStrength: 1, structureType: 'flow' },
        structureVideos: undefined,
        onAddStructureVideo: vi.fn(),
        onUpdateStructureVideo: vi.fn(),
        onPrimaryStructureVideoInputChange: vi.fn(),
        onShowVideoBrowser: vi.fn(),
        isUploadingStructureVideo: false,
        setIsUploadingStructureVideo: vi.fn(),
      },
      zoom: {
        onZoomIn: vi.fn(),
        onZoomOut: vi.fn(),
        onZoomReset: vi.fn(),
        onZoomToStart: vi.fn(),
      },
      bottom: {
        resetGap: false,
        setResetGap: vi.fn(),
        maxGap: 81,
        onReset: vi.fn(),
        onFileDrop: vi.fn(),
        isUploadingImage: false,
        uploadProgress: 0,
        pushMode: false,
      },
      ...overrides,
    } satisfies React.ComponentProps<typeof TimelineControls>;
  }

  it('renders zoom, audio, guidance, and bottom controls when the timeline is editable', () => {
    const onAudioChange = vi.fn();

    render(
      <TimelineControls
        {...buildProps({
          audio: { audioUrl: null, onAudioChange },
        })}
      />,
    );

    expect(screen.getByTestId('zoom-controls')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'add-audio-shot-1-project-1' })).toBeInTheDocument();
    expect(screen.getByTestId('guidance-video-controls')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-bottom-controls')).toBeInTheDocument();
    expect(captures.zoomProps).toMatchObject({
      zoomLevel: 1,
      hasNoImages: false,
    });
    expect(captures.guidanceProps).toMatchObject({
      shotId: 'shot-1',
      projectId: 'project-1',
      readOnly: false,
      fullMax: 120,
    });
    expect(captures.bottomProps).toMatchObject({
      readOnly: false,
      showDragHint: true,
      pushMode: false,
    });

    fireEvent.click(screen.getByRole('button', { name: 'add-audio-shot-1-project-1' }));
    expect(onAudioChange).toHaveBeenCalledWith('audio.mp3', { duration: 12 });
  });

  it('omits top controls when the primary structure video is absent in read-only mode', () => {
    render(
      <TimelineControls
        {...buildProps({
          timeline: {
            ...buildProps().timeline,
            readOnly: true,
          },
        })}
      />,
    );

    expect(screen.queryByTestId('zoom-controls')).not.toBeInTheDocument();
    expect(screen.queryByTestId('guidance-video-controls')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add-audio/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('timeline-bottom-controls')).toBeInTheDocument();
  });
});
