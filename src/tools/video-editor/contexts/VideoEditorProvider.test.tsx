import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildVideoEditorLightboxMedia, VideoEditorProvider } from '@/tools/video-editor/contexts/VideoEditorProvider';
import { useTimelineChromeContext } from '@/tools/video-editor/contexts/TimelineChromeContext';
import {
  useTimelineEditorData,
  useTimelineEditorOps,
} from '@/tools/video-editor/contexts/TimelineEditorContext';
import { useTimelinePlaybackContext } from '@/tools/video-editor/contexts/TimelinePlaybackContext';
import {
  shouldAllowTouchClipDrag,
  shouldAllowTouchMarquee,
  shouldExpandTouchTrimHandles,
  shouldPreserveTouchSelectionForMove,
  shouldToggleTouchSelection,
} from '@/tools/video-editor/lib/mobile-interaction-model';
import type { DataProvider } from '@/tools/video-editor/data/DataProvider';

const mocks = {
  setInputModality: vi.fn(),
  setInputModalityFromPointerType: vi.fn(() => 'touch'),
  setInteractionMode: vi.fn(),
  setGestureOwner: vi.fn(),
  setPrecisionEnabled: vi.fn(),
  setContextTarget: vi.fn(),
  setInspectorTarget: vi.fn(),
  selectClip: vi.fn(),
  selectClips: vi.fn(),
  replaceTimelineSelection: vi.fn(),
};

vi.mock('@/tools/video-editor/hooks/useEffects', () => ({
  useEffects: () => ({ data: [] }),
}));

vi.mock('@/tools/video-editor/hooks/useEffectRegistry', () => ({
  useEffectRegistry: vi.fn(),
}));

vi.mock('@/tools/video-editor/hooks/useEffectResources', () => ({
  useEffectResources: () => ({ effects: [] }),
}));

vi.mock('@/tools/video-editor/hooks/useTimelineState', () => ({
  useTimelineState: () => ({
    editor: {
      data: null,
      resolvedConfig: { registry: {} },
      deviceClass: 'tablet',
      inputModality: 'mouse',
      interactionMode: 'select',
      gestureOwner: 'timeline',
      precisionEnabled: false,
      contextTarget: { kind: 'timeline' },
      inspectorTarget: { kind: 'clip', clipId: 'clip-1' },
      interactionPolicy: {
        deviceClass: 'tablet',
        inputModality: 'mouse',
        interactionMode: 'select',
        gestureOwner: 'timeline',
        precisionEnabled: false,
        contextTarget: { kind: 'timeline' },
        inspectorTarget: { kind: 'clip', clipId: 'clip-1' },
      },
      selectedClipId: 'clip-1',
      selectedClipIds: ['clip-1'],
      selectedClipIdsRef: { current: ['clip-1'] },
      additiveSelectionRef: { current: false },
      selectedTrackId: 'track-1',
      primaryClipId: 'clip-1',
      selectedClip: null,
      selectedTrack: null,
      selectedClipHasPredecessor: false,
      compositionSize: { width: 1920, height: 1080 },
      trackScaleMap: {},
      scale: 1,
      scaleWidth: 1,
      isLoading: false,
      dataRef: { current: null },
      pendingOpsRef: { current: [] },
      interactionStateRef: { current: { drag: false, resize: false, listeners: new Set() } },
      coordinator: null,
      indicatorRef: { current: null },
      editAreaRef: { current: null },
      preferences: {
        activeClipTab: 'style',
        assetPanel: { isOpen: true },
      },
      timelineRef: { current: null },
      timelineWrapperRef: { current: null },
      setInputModality: mocks.setInputModality,
      setInputModalityFromPointerType: mocks.setInputModalityFromPointerType,
      setInteractionMode: mocks.setInteractionMode,
      setGestureOwner: mocks.setGestureOwner,
      setPrecisionEnabled: mocks.setPrecisionEnabled,
      setContextTarget: mocks.setContextTarget,
      setInspectorTarget: mocks.setInspectorTarget,
      setSelectedClipId: vi.fn(),
      isClipSelected: vi.fn(() => true),
      selectClip: mocks.selectClip,
      selectClips: mocks.selectClips,
      replaceTimelineSelection: mocks.replaceTimelineSelection,
      addToSelection: vi.fn(),
      clearSelection: vi.fn(),
      setSelectedTrackId: vi.fn(),
      setActiveClipTab: vi.fn(),
      setAssetPanelState: vi.fn(),
      registerGenerationAsset: vi.fn(),
      onCursorDrag: vi.fn(),
      onClickTimeArea: vi.fn(),
      onActionResizeStart: vi.fn(),
      onClipEdgeResizeEnd: vi.fn(),
      onOverlayChange: vi.fn(),
      onTimelineDragOver: vi.fn(),
      onTimelineDragLeave: vi.fn(),
      onTimelineDrop: vi.fn(),
      handleAssetDrop: vi.fn(),
      handleUpdateClips: vi.fn(),
      handleUpdateClipsDeep: vi.fn(),
      handleDeleteClips: vi.fn(),
      handleDeleteClip: vi.fn(),
      handleSelectedClipChange: vi.fn(),
      handleResetClipPosition: vi.fn(),
      handleResetClipsPosition: vi.fn(),
      handleSplitSelectedClip: vi.fn(),
      handleSplitClipAtTime: vi.fn(),
      handleSplitClipsAtPlayhead: vi.fn(),
      handleToggleMuteClips: vi.fn(),
      handleToggleMute: vi.fn(),
      handleDetachAudioClip: vi.fn(),
      handleTrackPopoverChange: vi.fn(),
      handleMoveTrack: vi.fn(),
      handleRemoveTrack: vi.fn(),
      moveSelectedClipToTrack: vi.fn(),
      moveSelectedClipsToTrack: vi.fn(),
      moveClipToRow: vi.fn(),
      createTrackAndMoveClip: vi.fn(),
      uploadFiles: vi.fn(),
      applyEdit: vi.fn(),
      patchRegistry: vi.fn(),
      registerAsset: vi.fn(),
    },
    chrome: { saveStatus: 'saved' },
    playback: { currentTime: 12.5 },
  }),
}));

function Consumer() {
  const editorData = useTimelineEditorData();
  const editorOps = useTimelineEditorOps();
  const chrome = useTimelineChromeContext();
  const playback = useTimelinePlaybackContext();

  return (
    <div>
      <span>{editorData.selectedClipId}</span>
      <span>{editorData.deviceClass}</span>
      <span>{editorData.inputModality}</span>
      <span>{editorData.interactionMode}</span>
      <span>{editorData.gestureOwner}</span>
      <span>{editorData.contextTarget?.kind}</span>
      <span>{editorData.inspectorTarget?.kind}</span>
      <span>{editorData.interactionPolicy.deviceClass}</span>
      <span data-testid="interaction-policy">{JSON.stringify(editorData.interactionPolicy)}</span>
      <span>{String(editorData.interactionStateRef.current.drag)}</span>
      <span>{typeof editorData.additiveSelectionRef?.current}</span>
      <span>{typeof editorOps.selectClip}</span>
      <span>{typeof editorOps.replaceTimelineSelection}</span>
      <span>{chrome.saveStatus}</span>
      <span>{playback.currentTime}</span>
      <button
        type="button"
        onClick={() => {
          editorOps.setInputModality('touch');
          editorOps.setInputModalityFromPointerType('touch');
          editorOps.setInteractionMode('trim');
          editorOps.setGestureOwner('trim');
          editorOps.setPrecisionEnabled(true);
          editorOps.setContextTarget({ kind: 'clip', clipId: 'clip-1' });
          editorOps.setInspectorTarget({ kind: 'selection', clipIds: ['clip-1'] });
        }}
      >
        update interaction
      </button>
    </div>
  );
}

describe('VideoEditorProvider', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockClear());
  });

  it('builds fallback lightbox media for raw video assets without a generation id', () => {
    expect(buildVideoEditorLightboxMedia('asset-1', {
      file: 'folder/video.mp4',
      src: 'https://example.com/video.mp4',
      thumbnailUrl: 'https://example.com/video.jpg',
      type: 'video/mp4',
    })).toEqual(expect.objectContaining({
      id: 'asset-1',
      generation_id: 'asset-1',
      location: 'https://example.com/video.mp4',
      thumbUrl: 'https://example.com/video.jpg',
      type: 'video',
    }));
  });

  it('provides editor data, editor ops, chrome, and playback contexts together', () => {
    const provider: DataProvider = {
      loadTimeline: vi.fn(),
      saveTimeline: vi.fn(),
      loadAssetRegistry: vi.fn(),
      resolveAssetUrl: vi.fn(),
    };
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <VideoEditorProvider dataProvider={provider} timelineId="timeline-1" userId="user-1">
          <Consumer />
        </VideoEditorProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText('clip-1')).toBeInTheDocument();
    expect(screen.getAllByText('tablet')).toHaveLength(2);
    expect(screen.getByText('mouse')).toBeInTheDocument();
    expect(screen.getByText('select')).toBeInTheDocument();
    expect(screen.getAllByText('timeline')).toHaveLength(2);
    expect(screen.getByTestId('interaction-policy')).toHaveTextContent(JSON.stringify({
      deviceClass: 'tablet',
      inputModality: 'mouse',
      interactionMode: 'select',
      gestureOwner: 'timeline',
      precisionEnabled: false,
      contextTarget: { kind: 'timeline' },
      inspectorTarget: { kind: 'clip', clipId: 'clip-1' },
    }));
    expect(screen.getByText('false')).toBeInTheDocument();
    expect(screen.getByText('boolean')).toBeInTheDocument();
    expect(screen.getAllByText('function')).toHaveLength(2);
    expect(screen.getByText('saved')).toBeInTheDocument();
    expect(screen.getByText('12.5')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'update interaction' }));

    expect(mocks.setInputModality).toHaveBeenCalledWith('touch');
    expect(mocks.setInputModalityFromPointerType).toHaveBeenCalledWith('touch');
    expect(mocks.setInteractionMode).toHaveBeenCalledWith('trim');
    expect(mocks.setGestureOwner).toHaveBeenCalledWith('trim');
    expect(mocks.setPrecisionEnabled).toHaveBeenCalledWith(true);
    expect(mocks.setContextTarget).toHaveBeenCalledWith({ kind: 'clip', clipId: 'clip-1' });
    expect(mocks.setInspectorTarget).toHaveBeenCalledWith({ kind: 'selection', clipIds: ['clip-1'] });
  });

  it('matches the touch interaction decision table for drag, marquee, trim, and selection routing', () => {
    expect({
      phoneTouchDragInSelect: shouldAllowTouchClipDrag('phone', 'touch', 'select'),
      phoneTouchDragInMove: shouldAllowTouchClipDrag('phone', 'touch', 'move'),
      tabletTouchMarqueeInSelect: shouldAllowTouchMarquee('tablet', 'touch', 'select'),
      tabletTouchMarqueeInMove: shouldAllowTouchMarquee('tablet', 'touch', 'move'),
      tabletMouseMarqueeInSelect: shouldAllowTouchMarquee('tablet', 'mouse', 'select'),
      phoneTouchTrimHandlesInTrim: shouldExpandTouchTrimHandles('phone', 'touch', 'trim'),
      phoneTouchTrimHandlesInSelect: shouldExpandTouchTrimHandles('phone', 'touch', 'select'),
      phoneTouchToggleSelectionInSelect: shouldToggleTouchSelection('phone', 'touch', 'select'),
      tabletTouchPreserveSelectionInMove: shouldPreserveTouchSelectionForMove('tablet', 'touch', 'move'),
      tabletMousePreserveSelectionInMove: shouldPreserveTouchSelectionForMove('tablet', 'mouse', 'move'),
    }).toEqual({
      phoneTouchDragInSelect: false,
      phoneTouchDragInMove: true,
      tabletTouchMarqueeInSelect: true,
      tabletTouchMarqueeInMove: false,
      tabletMouseMarqueeInSelect: true,
      phoneTouchTrimHandlesInTrim: true,
      phoneTouchTrimHandlesInSelect: false,
      phoneTouchToggleSelectionInSelect: true,
      tabletTouchPreserveSelectionInMove: true,
      tabletMousePreserveSelectionInMove: false,
    });
  });
});
