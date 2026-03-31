// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PairData } from '@/shared/types/pairData';
import { TimelineMediaProvider } from '../../TimelineMediaContext';
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

  function buildProps(): React.ComponentProps<typeof TimelineTrackPrelude> {
    const pairDataByIndex = new Map<number, PairData>([
      [0, {
        index: 0,
        frames: 61,
        startFrame: 0,
        endFrame: 61,
        startImage: {
          id: 'img-1',
          generationId: 'gen-1',
          primaryVariantId: 'variant-1',
          url: 'image-1.png',
          thumbUrl: 'thumb-1.png',
          position: 1,
        },
        endImage: {
          id: 'img-2',
          generationId: 'gen-2',
          primaryVariantId: 'variant-2',
          url: 'image-2.png',
          thumbUrl: 'thumb-2.png',
          position: 2,
        },
      }],
    ]);

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
        pairInfoWithPending: [{
          index: 0,
          startId: 'img-1',
          endId: 'img-2',
          startFrame: 0,
          endFrame: 61,
          frames: 61,
          generationStart: 51,
          contextStart: 61,
          contextEnd: 71,
        }],
        pairDataByIndex,
        localShotGenPositions: new Map([['img-1', 0], ['img-2', 61]]),
        segmentSlots: [{ id: 'slot-1' }] as never,
        isSegmentsLoading: false,
        hasPendingTask: vi.fn(),
        selectedOutputId: 'output-1',
        onPairClick: vi.fn<(pairIndex: number) => void>(),
        onOpenPairSettings: vi.fn<(pairIndex: number) => void>(),
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
          metadata: {
            duration_seconds: 2,
            frame_rate: 30,
            total_frames: 60,
            width: 1920,
            height: 1080,
            file_size: 1024,
          },
          treatment: 'adjust',
          motionStrength: 0.8,
          structureType: 'flow',
          uni3cEndPercent: 100,
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
    };
  }

  function renderPrelude(props: React.ComponentProps<typeof TimelineTrackPrelude>) {
    return render(
      <TimelineMediaProvider
        value={{
          structureVideos: props.guidance.structureVideos,
          isStructureVideoLoading: props.guidance.isStructureVideoLoading,
          cachedHasStructureVideo: props.guidance.cachedHasStructureVideo,
          onAddStructureVideo: props.guidance.onAddStructureVideo,
          onUpdateStructureVideo: props.guidance.onUpdateStructureVideo,
          onRemoveStructureVideo: props.guidance.onRemoveStructureVideo,
          primaryStructureVideo: props.guidance.primaryStructureVideo,
          onPrimaryStructureVideoInputChange: props.guidance.onPrimaryStructureVideoInputChange,
          audioUrl: props.audio.audioUrl,
          audioMetadata: props.audio.audioMetadata,
          onAudioChange: props.audio.onAudioChange,
          timelineFps: 30,
        }}
      >
        <TimelineTrackPrelude {...props} />
      </TimelineMediaProvider>,
    );
  }

  it('renders segment output, primary guidance strip, and audio strip with trailing controls', () => {
    const props = buildProps();
    renderPrelude(props);

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
      {
        videoPath: null,
        metadata: null,
        treatment: 'adjust',
        motionStrength: 1.0,
        structureType: 'flow',
      },
    );
  });

  it('renders the multi-video guidance container when structured video collection handlers are available', () => {
    const props = buildProps();

    renderPrelude({
      ...props,
      guidance: {
        ...props.guidance,
        structureVideos: [{ id: 'structure-1' }] as never,
      },
      audio: {
        audioUrl: null,
        audioMetadata: null,
        onAudioChange: vi.fn(),
      },
    });

    expect(screen.getByTestId('guidance-videos-container')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'guidance-strip' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('audio-strip')).not.toBeInTheDocument();
  });
});
