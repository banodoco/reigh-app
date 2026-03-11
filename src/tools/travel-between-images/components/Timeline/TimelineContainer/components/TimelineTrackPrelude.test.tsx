import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineTrackPrelude } from './TimelineTrackPrelude';

const captures = vi.hoisted(() => ({
  segmentOutputProps: null as unknown,
  guidanceVideosProps: null as unknown,
  guidanceStripProps: null as unknown,
  uploaderProps: null as unknown,
  audioProps: null as unknown,
}));

vi.mock('../../SegmentOutputStrip', () => ({
  SegmentOutputStrip: (props: unknown) => {
    captures.segmentOutputProps = props;
    return <div data-testid="segment-output-strip">segments</div>;
  },
}));

vi.mock('../../GuidanceVideosContainer', () => ({
  GuidanceVideosContainer: (props: unknown) => {
    captures.guidanceVideosProps = props;
    return <div data-testid="guidance-videos-container">guidance-videos</div>;
  },
}));

vi.mock('../../GuidanceVideoStrip', () => ({
  GuidanceVideoStrip: (props: { onRemove: () => void }) => {
    captures.guidanceStripProps = props;
    return (
      <button type="button" onClick={props.onRemove}>
        guidance-strip
      </button>
    );
  },
}));

vi.mock('../../GuidanceVideoUploader', () => ({
  GuidanceVideoUploader: (props: unknown) => {
    captures.uploaderProps = props;
    return <div data-testid="guidance-video-uploader">uploader</div>;
  },
}));

vi.mock('../../AudioStrip', () => ({
  AudioStrip: (props: unknown) => {
    captures.audioProps = props;
    return <div data-testid="audio-strip">audio</div>;
  },
}));

describe('TimelineTrackPrelude', () => {
  beforeEach(() => {
    captures.segmentOutputProps = null;
    captures.guidanceVideosProps = null;
    captures.guidanceStripProps = null;
    captures.uploaderProps = null;
    captures.audioProps = null;
  });

  function buildProps(overrides: Partial<React.ComponentProps<typeof TimelineTrackPrelude>> = {}) {
    return {
      timeline: {
        shotId: 'shot-1',
        projectId: 'project-1',
        readOnly: false,
        images: [{ id: 'img-1' }, { id: 'img-2' }] as never[],
        imagePositions: new Map([
          ['img-1', 0],
          ['img-2', 61],
        ]),
        activePendingFrame: null,
        trailingEndFrame: 78,
        hasCallbackTrailingVideo: false,
        hasLiveTrailingVideo: false,
        projectAspectRatio: '16:9',
        pairInfoWithPending: [{ index: 0 }],
        pairDataByIndex: new Map([[0, { index: 0 }]]),
        localShotGenPositions: new Map([['img-1', 0], ['img-2', 61]]),
        segmentSlots: [{ id: 'slot-1' }] as never,
        isSegmentsLoading: false,
        hasPendingTask: vi.fn(),
        selectedOutputId: 'output-1',
        onPairClick: vi.fn(),
        onOpenPairSettings: vi.fn(),
        onSegmentFrameCountChange: vi.fn(),
        onTrailingEndFrameChange: vi.fn(),
        onTrailingVideoInfo: vi.fn(),
        onFileDrop: vi.fn(),
        videoOutputs: [{ id: 'video-1' }] as never,
      },
      guidance: {
        structureVideos: undefined,
        isStructureVideoLoading: false,
        cachedHasStructureVideo: false,
        onAddStructureVideo: vi.fn(),
        onUpdateStructureVideo: vi.fn(),
        onRemoveStructureVideo: vi.fn(),
        primaryStructureVideo: {
          path: 'guide.mp4',
          metadata: { duration: 2 },
          treatment: 'adjust',
          motionStrength: 0.8,
          structureType: 'flow',
        },
        onPrimaryStructureVideoInputChange: vi.fn(),
        isUploadingStructureVideo: false,
        setIsUploadingStructureVideo: vi.fn(),
      },
      audio: {
        audioUrl: 'audio.mp3',
        audioMetadata: { duration: 12 },
        onAudioChange: vi.fn(),
      },
      layout: {
        fullMin: 0,
        fullMax: 120,
        fullRange: 120,
        containerWidth: 300,
        zoomLevel: 1,
        hasNoImages: false,
      },
      zoom: {
        onZoomIn: vi.fn(),
        onZoomOut: vi.fn(),
        onZoomReset: vi.fn(),
        onZoomToStart: vi.fn(),
      },
      ...overrides,
    } satisfies React.ComponentProps<typeof TimelineTrackPrelude>;
  }

  it('renders segment output, primary guidance strip, and audio strip with trailing controls', () => {
    const props = buildProps();
    render(<TimelineTrackPrelude {...props} />);

    expect(screen.getByTestId('segment-output-strip')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'guidance-strip' })).toBeInTheDocument();
    expect(screen.getByTestId('audio-strip')).toBeInTheDocument();
    expect(captures.segmentOutputProps).toMatchObject({
      selectedParentId: 'output-1',
      trailingSegmentMode: {
        imageId: 'img-2',
        imageFrame: 61,
        endFrame: 78,
      },
      isMultiImage: true,
      lastImageFrame: 61,
    });
    expect(captures.audioProps).toMatchObject({
      audioUrl: 'audio.mp3',
      compact: true,
    });

    fireEvent.click(screen.getByRole('button', { name: 'guidance-strip' }));
    expect(props.guidance.onPrimaryStructureVideoInputChange).toHaveBeenCalledWith(
      null,
      null,
      'adjust',
      1.0,
      'flow',
    );
  });

  it('renders the multi-video guidance container when structured video collection handlers are available', () => {
    render(
      <TimelineTrackPrelude
        {...buildProps({
          guidance: {
            ...buildProps().guidance,
            structureVideos: [{ id: 'structure-1' }] as never,
          },
          audio: {
            audioUrl: null,
            audioMetadata: null,
            onAudioChange: vi.fn(),
          },
        })}
      />,
    );

    expect(screen.getByTestId('guidance-videos-container')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'guidance-strip' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('audio-strip')).not.toBeInTheDocument();
  });
});
