import { useMemo } from 'react';
import type { useAssetManagement } from '@/tools/video-editor/hooks/useAssetManagement';
import type { useClipEditing } from '@/tools/video-editor/hooks/useClipEditing';
import type { useClipResize } from '@/tools/video-editor/hooks/useClipResize';
import type { useDragCoordinator } from '@/tools/video-editor/hooks/useDragCoordinator';
import type { useExternalDrop } from '@/tools/video-editor/hooks/useExternalDrop';
import type { useTimelinePlayback } from '@/tools/video-editor/hooks/useTimelinePlayback';
import type { useTimelineSelection } from '@/tools/video-editor/hooks/useTimelineSelection';
import type { useTimelineTrackManagement } from '@/tools/video-editor/hooks/useTimelineTrackManagement';
import type {
  EditorPreferences,
  TimelineApplyEdit,
  TimelineDataRef,
  TimelinePatchRegistry,
  TimelinePendingOpsRef,
  TimelineRegisterAsset,
  TimelineReloadFromServer,
  SaveStatus,
  TimelineRetrySaveAfterConflict,
  TimelineSetActiveClipTab,
  TimelineSetAssetPanelState,
  TimelineSetScaleWidth,
  TimelineSetSelectedTrackId,
  TimelineStartRender,
  TimelineUploadFiles,
} from '@/tools/video-editor/hooks/useTimelineData.types';
import type { useRenderState } from '@/tools/video-editor/hooks/useRenderState';
import type { useTimelineHistory } from '@/tools/video-editor/hooks/useTimelineHistory';
import type {
  TimelineChromeContextValue,
  TimelineEditorContextValue,
  TimelinePlaybackContextValue,
} from '@/tools/video-editor/hooks/useTimelineState.types';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data';

type SelectionHook = ReturnType<typeof useTimelineSelection>;
type DragCoordinatorHook = ReturnType<typeof useDragCoordinator>;
type TimelinePlaybackHook = ReturnType<typeof useTimelinePlayback>;
type TimelineTrackManagementHook = ReturnType<typeof useTimelineTrackManagement>;
type AssetManagementHook = ReturnType<typeof useAssetManagement>;
type ClipResizeHook = ReturnType<typeof useClipResize>;
type ClipEditingHook = ReturnType<typeof useClipEditing>;
type ExternalDropHook = ReturnType<typeof useExternalDrop>;
type TimelineHistoryHook = ReturnType<typeof useTimelineHistory>;
type RenderStateHook = ReturnType<typeof useRenderState>;

interface UseTimelineEditorContextValueArgs {
  data: TimelineData | null;
  selection: SelectionHook;
  selectedTrackId: string | null;
  compositionSize: { width: number; height: number };
  trackScaleMap: Record<string, number>;
  scale: number;
  scaleWidth: number;
  isLoading: boolean;
  dataRef: TimelineDataRef;
  pendingOpsRef: TimelinePendingOpsRef;
  editorPreferences: EditorPreferences;
  setSelectedTrackId: TimelineSetSelectedTrackId;
  setActiveClipTab: TimelineSetActiveClipTab;
  setAssetPanelState: TimelineSetAssetPanelState;
  dragCoordinator: DragCoordinatorHook;
  playback: TimelinePlaybackHook;
  assetManagement: AssetManagementHook;
  clipResize: ClipResizeHook;
  clipEditing: ClipEditingHook;
  externalDrop: ExternalDropHook;
  trackManagement: TimelineTrackManagementHook;
  uploadFiles: TimelineUploadFiles;
  applyEdit: TimelineApplyEdit;
  patchRegistry: TimelinePatchRegistry;
  registerAsset: TimelineRegisterAsset;
}

export function useTimelineEditorContextValue({
  data,
  selection,
  selectedTrackId,
  compositionSize,
  trackScaleMap,
  scale,
  scaleWidth,
  isLoading,
  dataRef,
  pendingOpsRef,
  editorPreferences,
  setSelectedTrackId,
  setActiveClipTab,
  setAssetPanelState,
  dragCoordinator,
  playback,
  assetManagement,
  clipResize,
  clipEditing,
  externalDrop,
  trackManagement,
  uploadFiles,
  applyEdit,
  patchRegistry,
  registerAsset,
}: UseTimelineEditorContextValueArgs): TimelineEditorContextValue {
  return useMemo<TimelineEditorContextValue>(() => ({
    data,
    resolvedConfig: selection.resolvedConfig,
    selectedClipId: selection.primaryClipId,
    selectedClipIds: selection.selectedClipIds,
    selectedClipIdsRef: selection.selectedClipIdsRef,
    selectedTrackId,
    primaryClipId: selection.primaryClipId,
    selectedClip: selection.selectedClip,
    selectedTrack: selection.selectedTrack,
    selectedClipHasPredecessor: selection.selectedClipHasPredecessor,
    compositionSize,
    trackScaleMap,
    scale,
    scaleWidth,
    isLoading,
    dataRef,
    pendingOpsRef,
    coordinator: dragCoordinator.coordinator,
    indicatorRef: dragCoordinator.indicatorRef,
    editAreaRef: dragCoordinator.editAreaRef,
    preferences: editorPreferences,
    timelineRef: playback.timelineRef,
    timelineWrapperRef: playback.timelineWrapperRef,
    setSelectedClipId: selection.setSelectedClipId,
    isClipSelected: selection.isClipSelected,
    selectClip: selection.selectClip,
    selectClips: selection.selectClips,
    addToSelection: selection.addToSelection,
    clearSelection: selection.clearSelection,
    setSelectedTrackId,
    setActiveClipTab,
    setAssetPanelState,
    registerGenerationAsset: assetManagement.registerGenerationAsset,
    onCursorDrag: playback.onCursorDrag,
    onClickTimeArea: playback.onClickTimeArea,
    onActionResizeStart: clipResize.onActionResizeStart,
    onActionResizeEnd: clipResize.onActionResizeEnd,
    onOverlayChange: clipEditing.onOverlayChange,
    onTimelineDragOver: externalDrop.onTimelineDragOver,
    onTimelineDragLeave: externalDrop.onTimelineDragLeave,
    onTimelineDrop: externalDrop.onTimelineDrop,
    handleAssetDrop: assetManagement.handleAssetDrop,
    handleUpdateClips: clipEditing.handleUpdateClips,
    handleUpdateClipsDeep: clipEditing.handleUpdateClipsDeep,
    handleDeleteClips: clipEditing.handleDeleteClips,
    handleDeleteClip: clipEditing.handleDeleteClip,
    handleSelectedClipChange: clipEditing.handleSelectedClipChange,
    handleResetClipPosition: clipEditing.handleResetClipPosition,
    handleResetClipsPosition: clipEditing.handleResetClipsPosition,
    handleSplitSelectedClip: clipEditing.handleSplitSelectedClip,
    handleSplitClipAtTime: clipEditing.handleSplitClipAtTime,
    handleSplitClipsAtPlayhead: clipEditing.handleSplitClipsAtPlayhead,
    handleToggleMuteClips: clipEditing.handleToggleMuteClips,
    handleToggleMute: clipEditing.handleToggleMute,
    handleTrackPopoverChange: trackManagement.handleTrackPopoverChange,
    handleMoveTrack: trackManagement.handleMoveTrack,
    handleRemoveTrack: trackManagement.handleRemoveTrack,
    moveSelectedClipToTrack: trackManagement.moveSelectedClipToTrack,
    moveSelectedClipsToTrack: trackManagement.moveSelectedClipsToTrack,
    moveClipToRow: trackManagement.moveClipToRow,
    createTrackAndMoveClip: trackManagement.createTrackAndMoveClip,
    uploadFiles,
    applyEdit,
    patchRegistry,
    registerAsset,
  }), [
    compositionSize,
    data,
    dataRef,
    isLoading,
    pendingOpsRef,
    editorPreferences,
    scale,
    scaleWidth,
    selectedTrackId,
    setActiveClipTab,
    setAssetPanelState,
    setSelectedTrackId,
    trackScaleMap,
    uploadFiles,
    applyEdit,
    patchRegistry,
    registerAsset,
    selection.addToSelection,
    assetManagement.handleAssetDrop,
    assetManagement.registerGenerationAsset,
    selection.clearSelection,
    clipEditing.handleDeleteClip,
    clipEditing.handleDeleteClips,
    clipEditing.handleResetClipPosition,
    clipEditing.handleResetClipsPosition,
    clipEditing.handleSelectedClipChange,
    clipEditing.handleSplitSelectedClip,
    clipEditing.handleSplitClipAtTime,
    clipEditing.handleSplitClipsAtPlayhead,
    clipEditing.handleToggleMuteClips,
    clipEditing.handleToggleMute,
    clipEditing.handleUpdateClips,
    clipEditing.handleUpdateClipsDeep,
    clipEditing.onOverlayChange,
    clipResize.onActionResizeEnd,
    clipResize.onActionResizeStart,
    dragCoordinator.coordinator,
    dragCoordinator.editAreaRef,
    dragCoordinator.indicatorRef,
    externalDrop.onTimelineDragLeave,
    externalDrop.onTimelineDragOver,
    externalDrop.onTimelineDrop,
    selection.isClipSelected,
    playback.onClickTimeArea,
    playback.onCursorDrag,
    playback.timelineRef,
    playback.timelineWrapperRef,
    selection.primaryClipId,
    selection.selectClip,
    selection.selectClips,
    selection.selectedClipIds,
    selection.selectedClipIdsRef,
    selection.resolvedConfig,
    selection.selectedClip,
    selection.selectedClipHasPredecessor,
    selection.selectedTrack,
    selection.setSelectedClipId,
    trackManagement.createTrackAndMoveClip,
    trackManagement.handleMoveTrack,
    trackManagement.handleRemoveTrack,
    trackManagement.handleTrackPopoverChange,
    trackManagement.moveClipToRow,
    trackManagement.moveSelectedClipToTrack,
    trackManagement.moveSelectedClipsToTrack,
  ]);
}

interface UseTimelineChromeContextValueArgs {
  timelineName: string | null;
  saveStatus: SaveStatus;
  isConflictExhausted: boolean;
  render: Pick<
    RenderStateHook,
    | 'renderStatus'
    | 'renderLog'
    | 'renderDirty'
    | 'renderProgress'
    | 'renderResultUrl'
    | 'renderResultFilename'
  >;
  history: Pick<
    TimelineHistoryHook,
    | 'undo'
    | 'redo'
    | 'canUndo'
    | 'canRedo'
    | 'checkpoints'
    | 'jumpToCheckpoint'
    | 'createManualCheckpoint'
  >;
  setScaleWidth: TimelineSetScaleWidth;
  trackManagement: Pick<
    TimelineTrackManagementHook,
    'handleAddTrack' | 'handleClearUnusedTracks' | 'unusedTrackCount'
  >;
  clipEditing: Pick<ClipEditingHook, 'handleAddText' | 'handleAddTextAt'>;
  reloadFromServer: TimelineReloadFromServer;
  retrySaveAfterConflict: TimelineRetrySaveAfterConflict;
  startRender: TimelineStartRender;
}

export function useTimelineChromeContextValue({
  timelineName,
  saveStatus,
  isConflictExhausted,
  render,
  history,
  setScaleWidth,
  trackManagement,
  clipEditing,
  reloadFromServer,
  retrySaveAfterConflict,
  startRender,
}: UseTimelineChromeContextValueArgs): TimelineChromeContextValue {
  return useMemo<TimelineChromeContextValue>(() => ({
    timelineName,
    saveStatus,
    isConflictExhausted,
    renderStatus: render.renderStatus,
    renderLog: render.renderLog,
    renderDirty: render.renderDirty,
    renderProgress: render.renderProgress,
    renderResultUrl: render.renderResultUrl,
    renderResultFilename: render.renderResultFilename,
    undo: history.undo,
    redo: history.redo,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    checkpoints: history.checkpoints,
    jumpToCheckpoint: history.jumpToCheckpoint,
    createManualCheckpoint: history.createManualCheckpoint,
    setScaleWidth,
    handleAddTrack: trackManagement.handleAddTrack,
    handleClearUnusedTracks: trackManagement.handleClearUnusedTracks,
    unusedTrackCount: trackManagement.unusedTrackCount,
    handleAddText: clipEditing.handleAddText,
    handleAddTextAt: clipEditing.handleAddTextAt,
    reloadFromServer,
    retrySaveAfterConflict,
    startRender,
  }), [
    clipEditing.handleAddText,
    clipEditing.handleAddTextAt,
    history.canRedo,
    history.canUndo,
    history.checkpoints,
    history.createManualCheckpoint,
    history.jumpToCheckpoint,
    history.redo,
    history.undo,
    isConflictExhausted,
    reloadFromServer,
    render.renderDirty,
    render.renderLog,
    render.renderProgress,
    render.renderResultFilename,
    render.renderResultUrl,
    render.renderStatus,
    retrySaveAfterConflict,
    saveStatus,
    setScaleWidth,
    startRender,
    timelineName,
    trackManagement.handleAddTrack,
    trackManagement.handleClearUnusedTracks,
    trackManagement.unusedTrackCount,
  ]);
}

interface UseTimelinePlaybackContextValueArgs {
  playback: Pick<
    TimelinePlaybackHook,
    'currentTime' | 'previewRef' | 'playerContainerRef' | 'onPreviewTimeUpdate' | 'formatTime'
  >;
}

export function useTimelinePlaybackContextValue({
  playback,
}: UseTimelinePlaybackContextValueArgs): TimelinePlaybackContextValue {
  return useMemo<TimelinePlaybackContextValue>(() => ({
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
}
