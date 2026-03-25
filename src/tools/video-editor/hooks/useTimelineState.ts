import { useMemo } from 'react';
import { useProjectSelectionContext } from '@/shared/contexts/ProjectContext';
import { useVideoEditorRuntime } from '@/tools/video-editor/contexts/DataProviderContext';
import { ROW_HEIGHT, TIMELINE_START_LEFT } from '@/tools/video-editor/lib/coordinate-utils';
import { useAssetManagement } from '@/tools/video-editor/hooks/useAssetManagement';
import { useClipEditing } from '@/tools/video-editor/hooks/useClipEditing';
import { useClipResize } from '@/tools/video-editor/hooks/useClipResize';
import { useTimelineData } from '@/tools/video-editor/hooks/useTimelineData';
import { useDragCoordinator } from '@/tools/video-editor/hooks/useDragCoordinator';
import { useExternalDrop } from '@/tools/video-editor/hooks/useExternalDrop';
import { useTimelinePlayback } from '@/tools/video-editor/hooks/useTimelinePlayback';
import type {
  TimelineChromeContextValue,
  TimelineEditorContextValue,
  TimelinePlaybackContextValue,
  UseTimelineStateResult,
} from '@/tools/video-editor/hooks/useTimelineState.types';
import { useTimelineTrackManagement } from '@/tools/video-editor/hooks/useTimelineTrackManagement';

export type { SaveStatus, RenderStatus, EditorPreferences } from '@/tools/video-editor/hooks/useTimelineData';

export function useTimelineState(): UseTimelineStateResult {
  const runtime = useVideoEditorRuntime();
  const playback = useTimelinePlayback();
  const dataHook = useTimelineData();
  const { selectedProjectId } = useProjectSelectionContext();

  const dragCoordinator = useDragCoordinator({
    dataRef: dataHook.dataRef,
    scale: dataHook.scale,
    scaleWidth: dataHook.scaleWidth,
    startLeft: TIMELINE_START_LEFT,
    rowHeight: ROW_HEIGHT,
  });

  const assetManagement = useAssetManagement({
    dataRef: dataHook.dataRef,
    selectedTrackId: dataHook.selectedTrackId,
    selectedProjectId,
    setSelectedClipId: dataHook.setSelectedClipId,
    setSelectedTrackId: dataHook.setSelectedTrackId,
    applyTimelineEdit: dataHook.applyTimelineEdit,
    patchRegistry: dataHook.patchRegistry,
    registerAsset: dataHook.registerAsset,
    uploadAsset: dataHook.uploadAsset,
    invalidateAssetRegistry: dataHook.invalidateAssetRegistry,
    resolveAssetUrl: runtime.provider.resolveAssetUrl.bind(runtime.provider),
  });

  const externalDrop = useExternalDrop({
    dataRef: dataHook.dataRef,
    scale: dataHook.scale,
    scaleWidth: dataHook.scaleWidth,
    selectedTrackId: dataHook.selectedTrackId,
    applyTimelineEdit: dataHook.applyTimelineEdit,
    patchRegistry: dataHook.patchRegistry,
    registerAsset: dataHook.registerAsset,
    uploadAsset: dataHook.uploadAsset,
    invalidateAssetRegistry: dataHook.invalidateAssetRegistry,
    resolveAssetUrl: runtime.provider.resolveAssetUrl.bind(runtime.provider),
    coordinator: dragCoordinator.coordinator,
    registerGenerationAsset: assetManagement.registerGenerationAsset,
    uploadImageGeneration: assetManagement.uploadImageGeneration,
    handleAssetDrop: assetManagement.handleAssetDrop,
  });

  const clipResize = useClipResize({
    dataRef: dataHook.dataRef,
    applyTimelineEdit: dataHook.applyTimelineEdit,
  });

  const clipEditing = useClipEditing({
    dataRef: dataHook.dataRef,
    resolvedConfig: dataHook.resolvedConfig,
    selectedClipId: dataHook.selectedClipId,
    selectedTrack: dataHook.selectedTrack,
    currentTime: playback.currentTime,
    setSelectedClipId: dataHook.setSelectedClipId,
    setSelectedTrackId: dataHook.setSelectedTrackId,
    applyTimelineEdit: dataHook.applyTimelineEdit,
    applyResolvedConfigEdit: dataHook.applyResolvedConfigEdit,
  });

  const trackManagement = useTimelineTrackManagement({
    dataRef: dataHook.dataRef,
    resolvedConfig: dataHook.resolvedConfig,
    selectedClipId: dataHook.selectedClipId,
    setSelectedTrackId: dataHook.setSelectedTrackId,
    applyTimelineEdit: dataHook.applyTimelineEdit,
    applyResolvedConfigEdit: dataHook.applyResolvedConfigEdit,
  });

  const editor = useMemo<TimelineEditorContextValue>(() => ({
    data: dataHook.data,
    resolvedConfig: dataHook.resolvedConfig,
    selectedClipId: dataHook.selectedClipId,
    selectedTrackId: dataHook.selectedTrackId,
    selectedClip: dataHook.selectedClip,
    selectedTrack: dataHook.selectedTrack,
    selectedClipHasPredecessor: dataHook.selectedClipHasPredecessor,
    compositionSize: dataHook.compositionSize,
    trackScaleMap: dataHook.trackScaleMap,
    scale: dataHook.scale,
    scaleWidth: dataHook.scaleWidth,
    isLoading: dataHook.isLoading,
    dataRef: dataHook.dataRef,
    coordinator: dragCoordinator.coordinator,
    indicatorRef: dragCoordinator.indicatorRef,
    editAreaRef: dragCoordinator.editAreaRef,
    preferences: dataHook.preferences,
    timelineRef: playback.timelineRef,
    timelineWrapperRef: playback.timelineWrapperRef,
    setSelectedClipId: dataHook.setSelectedClipId,
    setSelectedTrackId: dataHook.setSelectedTrackId,
    setActiveClipTab: dataHook.setActiveClipTab,
    setAssetPanelState: dataHook.setAssetPanelState,
    registerGenerationAsset: assetManagement.registerGenerationAsset,
    onCursorDrag: playback.onCursorDrag,
    onClickTimeArea: playback.onClickTimeArea,
    onActionResizeStart: clipResize.onActionResizeStart,
    onActionResizeEnd: clipResize.onActionResizeEnd,
    onChange: clipEditing.onChange,
    onOverlayChange: clipEditing.onOverlayChange,
    onTimelineDragOver: externalDrop.onTimelineDragOver,
    onTimelineDragLeave: externalDrop.onTimelineDragLeave,
    onTimelineDrop: externalDrop.onTimelineDrop,
    handleAssetDrop: assetManagement.handleAssetDrop,
    handleDeleteClip: clipEditing.handleDeleteClip,
    handleSelectedClipChange: clipEditing.handleSelectedClipChange,
    handleResetClipPosition: clipEditing.handleResetClipPosition,
    handleSplitSelectedClip: clipEditing.handleSplitSelectedClip,
    handleSplitClipAtTime: clipEditing.handleSplitClipAtTime,
    handleToggleMute: clipEditing.handleToggleMute,
    handleTrackPopoverChange: trackManagement.handleTrackPopoverChange,
    handleReorderTrack: trackManagement.handleReorderTrack,
    handleRemoveTrack: trackManagement.handleRemoveTrack,
    moveSelectedClipToTrack: trackManagement.moveSelectedClipToTrack,
    moveClipToRow: trackManagement.moveClipToRow,
    createTrackAndMoveClip: trackManagement.createTrackAndMoveClip,
    uploadFiles: dataHook.uploadFiles,
  }), [
    dataHook.compositionSize,
    dataHook.data,
    dataHook.dataRef,
    dataHook.isLoading,
    dataHook.preferences,
    dataHook.resolvedConfig,
    dataHook.scale,
    dataHook.scaleWidth,
    dataHook.selectedClip,
    dataHook.selectedClipHasPredecessor,
    dataHook.selectedClipId,
    dataHook.selectedTrack,
    dataHook.selectedTrackId,
    dataHook.setActiveClipTab,
    dataHook.setAssetPanelState,
    dataHook.setSelectedClipId,
    dataHook.setSelectedTrackId,
    dataHook.trackScaleMap,
    dataHook.uploadFiles,
    assetManagement.handleAssetDrop,
    assetManagement.registerGenerationAsset,
    clipEditing.handleDeleteClip,
    clipEditing.handleResetClipPosition,
    clipEditing.handleSelectedClipChange,
    clipEditing.handleSplitSelectedClip,
    clipEditing.handleSplitClipAtTime,
    clipEditing.handleToggleMute,
    clipEditing.onChange,
    clipEditing.onOverlayChange,
    clipResize.onActionResizeEnd,
    clipResize.onActionResizeStart,
    dragCoordinator.coordinator,
    dragCoordinator.editAreaRef,
    dragCoordinator.indicatorRef,
    externalDrop.onTimelineDragLeave,
    externalDrop.onTimelineDragOver,
    externalDrop.onTimelineDrop,
    playback.onClickTimeArea,
    playback.onCursorDrag,
    playback.timelineRef,
    playback.timelineWrapperRef,
    trackManagement.createTrackAndMoveClip,
    trackManagement.handleRemoveTrack,
    trackManagement.handleReorderTrack,
    trackManagement.handleTrackPopoverChange,
    trackManagement.moveClipToRow,
    trackManagement.moveSelectedClipToTrack,
  ]);

  const chrome = useMemo<TimelineChromeContextValue>(() => ({
    timelineName: runtime.timelineName ?? null,
    saveStatus: dataHook.saveStatus,
    renderStatus: dataHook.renderStatus,
    renderLog: dataHook.renderLog,
    renderDirty: dataHook.renderDirty,
    renderProgress: dataHook.renderProgress,
    renderResultUrl: dataHook.renderResultUrl,
    renderResultFilename: dataHook.renderResultFilename,
    setScaleWidth: dataHook.setScaleWidth,
    handleAddTrack: trackManagement.handleAddTrack,
    handleClearUnusedTracks: trackManagement.handleClearUnusedTracks,
    unusedTrackCount: trackManagement.unusedTrackCount,
    handleAddText: clipEditing.handleAddText,
    reloadFromServer: dataHook.reloadFromServer,
    startRender: dataHook.startRender,
  }), [
    runtime.timelineName,
    dataHook.reloadFromServer,
    dataHook.renderDirty,
    dataHook.renderLog,
    dataHook.renderProgress,
    dataHook.renderResultFilename,
    dataHook.renderResultUrl,
    dataHook.renderStatus,
    dataHook.saveStatus,
    dataHook.setScaleWidth,
    dataHook.startRender,
    clipEditing.handleAddText,
    trackManagement.handleAddTrack,
    trackManagement.handleClearUnusedTracks,
    trackManagement.unusedTrackCount,
  ]);

  const playbackValue = useMemo<TimelinePlaybackContextValue>(() => ({
    currentTime: playback.currentTime,
    previewRef: playback.previewRef,
    playerContainerRef: playback.playerContainerRef,
    onPreviewTimeUpdate: playback.onPreviewTimeUpdate,
    formatTime: playback.formatTime,
  }), [
    playback.currentTime,
    playback.formatTime,
    playback.onPreviewTimeUpdate,
    playback.playerContainerRef,
    playback.previewRef,
  ]);

  return {
    editor,
    chrome,
    playback: playbackValue,
  };
}
