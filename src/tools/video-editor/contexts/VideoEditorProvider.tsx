import { useCallback, useMemo, useRef } from 'react';
import type { DataProvider } from '@/tools/video-editor/data/DataProvider';
import { DataProviderWrapper } from '@/tools/video-editor/contexts/DataProviderContext';
import { TimelineChromeContextProvider } from '@/tools/video-editor/contexts/TimelineChromeContext';
import {
  TimelineEditorDataContextProvider,
  TimelineEditorOpsContextProvider,
} from '@/tools/video-editor/contexts/TimelineEditorContext';
import { TimelinePlaybackContextProvider } from '@/tools/video-editor/contexts/TimelinePlaybackContext';
import { useEffects } from '@/tools/video-editor/hooks/useEffects';
import { useEffectRegistry } from '@/tools/video-editor/hooks/useEffectRegistry';
import { useEffectResources } from '@/tools/video-editor/hooks/useEffectResources';
import { useTimelineState } from '@/tools/video-editor/hooks/useTimelineState';
import type {
  TimelineEditorDataContextValue,
  TimelineEditorOpsContextValue,
} from '@/tools/video-editor/hooks/useTimelineState.types';

function InnerProvider({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId: string;
}) {
  const effectsQuery = useEffects(userId);
  const effectResources = useEffectResources(userId);
  useEffectRegistry(
    effectsQuery.data?.map((effect) => ({
      slug: effect.slug,
      code: effect.code,
    })),
    effectResources.effects,
  );
  const { editor, chrome, playback } = useTimelineState();

  // Shared lightbox callback — PreviewPanel registers its handler, timeline clips call it
  const lightboxHandlerRef = useRef<((assetKey: string) => void) | null>(null);
  const onDoubleClickAsset = useCallback((assetKey: string) => {
    lightboxHandlerRef.current?.(assetKey);
  }, []);

  const registerLightboxHandler = useCallback((handler: ((assetKey: string) => void) | null) => {
    lightboxHandlerRef.current = handler;
  }, []);

  const editorData = useMemo<TimelineEditorDataContextValue>(() => ({
    data: editor.data,
    resolvedConfig: editor.resolvedConfig,
    selectedClipId: editor.selectedClipId,
    selectedClipIds: editor.selectedClipIds,
    selectedClipIdsRef: editor.selectedClipIdsRef,
    selectedTrackId: editor.selectedTrackId,
    primaryClipId: editor.primaryClipId,
    selectedClip: editor.selectedClip,
    selectedTrack: editor.selectedTrack,
    selectedClipHasPredecessor: editor.selectedClipHasPredecessor,
    compositionSize: editor.compositionSize,
    trackScaleMap: editor.trackScaleMap,
    scale: editor.scale,
    scaleWidth: editor.scaleWidth,
    isLoading: editor.isLoading,
    dataRef: editor.dataRef,
    pendingOpsRef: editor.pendingOpsRef,
    coordinator: editor.coordinator,
    indicatorRef: editor.indicatorRef,
    editAreaRef: editor.editAreaRef,
    preferences: editor.preferences,
    timelineRef: editor.timelineRef,
    timelineWrapperRef: editor.timelineWrapperRef,
  }), [editor]);

  const editorOps = useMemo<TimelineEditorOpsContextValue>(() => ({
    setSelectedClipId: editor.setSelectedClipId,
    isClipSelected: editor.isClipSelected,
    selectClip: editor.selectClip,
    selectClips: editor.selectClips,
    addToSelection: editor.addToSelection,
    clearSelection: editor.clearSelection,
    setSelectedTrackId: editor.setSelectedTrackId,
    setActiveClipTab: editor.setActiveClipTab,
    setAssetPanelState: editor.setAssetPanelState,
    registerGenerationAsset: editor.registerGenerationAsset,
    onCursorDrag: editor.onCursorDrag,
    onClickTimeArea: editor.onClickTimeArea,
    onActionResizeStart: editor.onActionResizeStart,
    onActionResizeEnd: editor.onActionResizeEnd,
    onOverlayChange: editor.onOverlayChange,
    onTimelineDragOver: editor.onTimelineDragOver,
    onTimelineDragLeave: editor.onTimelineDragLeave,
    onTimelineDrop: editor.onTimelineDrop,
    handleAssetDrop: editor.handleAssetDrop,
    handleUpdateClips: editor.handleUpdateClips,
    handleUpdateClipsDeep: editor.handleUpdateClipsDeep,
    handleDeleteClips: editor.handleDeleteClips,
    handleDeleteClip: editor.handleDeleteClip,
    handleSelectedClipChange: editor.handleSelectedClipChange,
    handleResetClipPosition: editor.handleResetClipPosition,
    handleResetClipsPosition: editor.handleResetClipsPosition,
    handleSplitSelectedClip: editor.handleSplitSelectedClip,
    handleSplitClipAtTime: editor.handleSplitClipAtTime,
    handleSplitClipsAtPlayhead: editor.handleSplitClipsAtPlayhead,
    handleToggleMuteClips: editor.handleToggleMuteClips,
    handleToggleMute: editor.handleToggleMute,
    handleTrackPopoverChange: editor.handleTrackPopoverChange,
    handleMoveTrack: editor.handleMoveTrack,
    handleRemoveTrack: editor.handleRemoveTrack,
    moveSelectedClipToTrack: editor.moveSelectedClipToTrack,
    moveSelectedClipsToTrack: editor.moveSelectedClipsToTrack,
    moveClipToRow: editor.moveClipToRow,
    createTrackAndMoveClip: editor.createTrackAndMoveClip,
    uploadFiles: editor.uploadFiles,
    applyEdit: editor.applyEdit,
    patchRegistry: editor.patchRegistry,
    registerAsset: editor.registerAsset,
    onDoubleClickAsset,
    registerLightboxHandler,
  }), [editor, onDoubleClickAsset, registerLightboxHandler]);

  return (
    <TimelineEditorDataContextProvider value={editorData}>
      <TimelineEditorOpsContextProvider value={editorOps}>
        <TimelineChromeContextProvider value={chrome}>
          <TimelinePlaybackContextProvider value={playback}>
            {children}
          </TimelinePlaybackContextProvider>
        </TimelineChromeContextProvider>
      </TimelineEditorOpsContextProvider>
    </TimelineEditorDataContextProvider>
  );
}

export function VideoEditorProvider({
  dataProvider,
  timelineId,
  timelineName,
  userId,
  children,
}: {
  dataProvider: DataProvider;
  timelineId: string;
  timelineName?: string | null;
  userId: string;
  children: React.ReactNode;
}) {
  return (
    <DataProviderWrapper value={{ provider: dataProvider, timelineId, timelineName, userId }}>
      <InnerProvider userId={userId}>{children}</InnerProvider>
    </DataProviderWrapper>
  );
}
