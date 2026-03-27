import { useCallback, useLayoutEffect, useMemo } from 'react';
import { useProjectSelectionContext } from '@/shared/contexts/ProjectContext';
import { useVideoEditorRuntime } from '@/tools/video-editor/contexts/DataProviderContext';
import { ROW_HEIGHT, TIMELINE_START_LEFT } from '@/tools/video-editor/lib/coordinate-utils';
import { useAssetManagement } from '@/tools/video-editor/hooks/useAssetManagement';
import { useClipEditing } from '@/tools/video-editor/hooks/useClipEditing';
import { useClipResize } from '@/tools/video-editor/hooks/useClipResize';
import { useDerivedTimeline } from '@/tools/video-editor/hooks/useDerivedTimeline';
import { useTimelineData } from '@/tools/video-editor/hooks/useTimelineData';
import { useDragCoordinator } from '@/tools/video-editor/hooks/useDragCoordinator';
import { useExternalDrop } from '@/tools/video-editor/hooks/useExternalDrop';
import { useMultiSelect, type SelectClipOptions } from '@/tools/video-editor/hooks/useMultiSelect';
import { useTimelinePlayback } from '@/tools/video-editor/hooks/useTimelinePlayback';
import type {
  TimelineChromeContextValue,
  TimelineEditorContextValue,
  TimelinePlaybackContextValue,
  UseTimelineStateResult,
} from '@/tools/video-editor/hooks/useTimelineState.types';
import { useTimelineTrackManagement } from '@/tools/video-editor/hooks/useTimelineTrackManagement';

export type { SaveStatus, RenderStatus, EditorPreferences } from '@/tools/video-editor/hooks/useTimelineData';

const getFirstSelectedClipId = (clipIds: ReadonlySet<string>): string | null => {
  for (const clipId of clipIds) {
    return clipId;
  }

  return null;
};

const getPrimaryClipId = (
  clipIds: ReadonlySet<string>,
  preferredClipId: string | null,
): string | null => {
  if (preferredClipId && clipIds.has(preferredClipId)) {
    return preferredClipId;
  }

  return getFirstSelectedClipId(clipIds);
};

export function useTimelineState(): UseTimelineStateResult {
  const runtime = useVideoEditorRuntime();
  const playback = useTimelinePlayback();
  const dataHook = useTimelineData();
  const multiSelect = useMultiSelect();
  const {
    addToSelection: addToSelectionState,
    clearSelection: clearSelectionState,
    isClipSelected,
    primaryClipId,
    pruneSelection,
    selectClip: selectClipState,
    selectClips: selectClipsState,
    selectedClipIds,
    selectedClipIdsRef,
  } = multiSelect;
  const selectionDerived = useDerivedTimeline(
    dataHook.data,
    primaryClipId,
    dataHook.selectedTrackId,
  );
  const { selectedProjectId } = useProjectSelectionContext();

  const selectClip = useCallback((clipId: string, opts?: SelectClipOptions) => {
    let nextPrimaryClipId = clipId;

    if (opts?.toggle) {
      const nextSelection = new Set(selectedClipIdsRef.current);
      if (nextSelection.has(clipId)) {
        nextSelection.delete(clipId);
        nextPrimaryClipId = getPrimaryClipId(
          nextSelection,
          primaryClipId === clipId ? null : primaryClipId,
        );
      }
    }

    selectClipState(clipId, opts);
    dataHook.setSelectedClipId(nextPrimaryClipId);
  }, [dataHook, primaryClipId, selectClipState, selectedClipIdsRef]);

  const selectClips = useCallback((clipIds: Iterable<string>) => {
    const nextSelection = new Set<string>();
    for (const clipId of clipIds) {
      nextSelection.add(clipId);
    }

    selectClipsState(nextSelection);
    dataHook.setSelectedClipId(getPrimaryClipId(nextSelection, null));
  }, [dataHook, selectClipsState]);

  const addToSelection = useCallback((clipIds: Iterable<string>) => {
    const nextSelection = new Set(selectedClipIdsRef.current);
    const nextClipIds = new Set<string>();
    for (const clipId of clipIds) {
      nextSelection.add(clipId);
      nextClipIds.add(clipId);
    }

    addToSelectionState(nextClipIds);
    dataHook.setSelectedClipId(getPrimaryClipId(nextSelection, primaryClipId));
  }, [addToSelectionState, dataHook, primaryClipId, selectedClipIdsRef]);

  const clearSelection = useCallback(() => {
    clearSelectionState();
    dataHook.setSelectedClipId(null);
  }, [clearSelectionState, dataHook]);

  const setSelectedClipId = useCallback<React.Dispatch<React.SetStateAction<string | null>>>((updater) => {
    const nextClipId = typeof updater === 'function'
      ? updater(primaryClipId)
      : updater;

    if (nextClipId === null) {
      clearSelection();
      return;
    }

    selectClip(nextClipId);
  }, [clearSelection, primaryClipId, selectClip]);

  useLayoutEffect(() => {
    dataHook.pruneSelectionRef.current = pruneSelection;

    return () => {
      if (dataHook.pruneSelectionRef.current === pruneSelection) {
        dataHook.pruneSelectionRef.current = null;
      }
    };
  }, [dataHook.pruneSelectionRef, pruneSelection]);

  useLayoutEffect(() => {
    if (!dataHook.selectedClipId || dataHook.selectedClipId === primaryClipId) {
      return;
    }

    selectClipState(dataHook.selectedClipId);
  }, [dataHook.selectedClipId, primaryClipId, selectClipState]);

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
    setSelectedClipId,
    setSelectedTrackId: dataHook.setSelectedTrackId,
    applyTimelineEdit: dataHook.applyTimelineEdit,
    patchRegistry: dataHook.patchRegistry,
    registerAsset: dataHook.registerAsset,
    uploadAsset: dataHook.uploadAsset,
    invalidateAssetRegistry: dataHook.invalidateAssetRegistry,
    resolveAssetUrl: runtime.provider.resolveAssetUrl.bind(runtime.provider),
  });

  const clipResize = useClipResize({
    dataRef: dataHook.dataRef,
    applyTimelineEdit: dataHook.applyTimelineEdit,
  });

  const clipEditing = useClipEditing({
    dataRef: dataHook.dataRef,
    resolvedConfig: selectionDerived.resolvedConfig,
    selectedClipId: primaryClipId,
    selectedTrack: selectionDerived.selectedTrack,
    currentTime: playback.currentTime,
    setSelectedClipId,
    setSelectedTrackId: dataHook.setSelectedTrackId,
    applyTimelineEdit: dataHook.applyTimelineEdit,
    applyResolvedConfigEdit: dataHook.applyResolvedConfigEdit,
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
    handleAddTextAt: clipEditing.handleAddTextAt,
  });

  const trackManagement = useTimelineTrackManagement({
    dataRef: dataHook.dataRef,
    resolvedConfig: selectionDerived.resolvedConfig,
    selectedClipId: primaryClipId,
    setSelectedTrackId: dataHook.setSelectedTrackId,
    applyTimelineEdit: dataHook.applyTimelineEdit,
    applyResolvedConfigEdit: dataHook.applyResolvedConfigEdit,
  });

  const editor = useMemo<TimelineEditorContextValue>(() => ({
    data: dataHook.data,
    resolvedConfig: selectionDerived.resolvedConfig,
    selectedClipId: primaryClipId,
    selectedClipIds,
    selectedClipIdsRef,
    selectedTrackId: dataHook.selectedTrackId,
    primaryClipId,
    selectedClip: selectionDerived.selectedClip,
    selectedTrack: selectionDerived.selectedTrack,
    selectedClipHasPredecessor: selectionDerived.selectedClipHasPredecessor,
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
    setSelectedClipId,
    isClipSelected,
    selectClip,
    selectClips,
    addToSelection,
    clearSelection,
    setSelectedTrackId: dataHook.setSelectedTrackId,
    setActiveClipTab: dataHook.setActiveClipTab,
    setAssetPanelState: dataHook.setAssetPanelState,
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
    uploadFiles: dataHook.uploadFiles,
    applyTimelineEdit: dataHook.applyTimelineEdit,
  }), [
    dataHook.compositionSize,
    dataHook.data,
    dataHook.dataRef,
    dataHook.isLoading,
    dataHook.preferences,
    dataHook.scale,
    dataHook.scaleWidth,
    dataHook.selectedTrackId,
    dataHook.setActiveClipTab,
    dataHook.setAssetPanelState,
    dataHook.setSelectedTrackId,
    dataHook.trackScaleMap,
    dataHook.uploadFiles,
    dataHook.applyTimelineEdit,
    addToSelection,
    assetManagement.handleAssetDrop,
    assetManagement.registerGenerationAsset,
    clearSelection,
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
    isClipSelected,
    playback.onClickTimeArea,
    playback.onCursorDrag,
    playback.timelineRef,
    playback.timelineWrapperRef,
    primaryClipId,
    selectClip,
    selectClips,
    selectedClipIds,
    selectedClipIdsRef,
    selectionDerived.resolvedConfig,
    selectionDerived.selectedClip,
    selectionDerived.selectedClipHasPredecessor,
    selectionDerived.selectedTrack,
    setSelectedClipId,
    trackManagement.createTrackAndMoveClip,
    trackManagement.handleMoveTrack,
    trackManagement.handleRemoveTrack,
    trackManagement.handleTrackPopoverChange,
    trackManagement.moveClipToRow,
    trackManagement.moveSelectedClipToTrack,
    trackManagement.moveSelectedClipsToTrack,
  ]);

  const chrome = useMemo<TimelineChromeContextValue>(() => ({
    timelineName: runtime.timelineName ?? null,
    saveStatus: dataHook.saveStatus,
    isConflictExhausted: dataHook.isConflictExhausted,
    renderStatus: dataHook.renderStatus,
    renderLog: dataHook.renderLog,
    renderDirty: dataHook.renderDirty,
    renderProgress: dataHook.renderProgress,
    renderResultUrl: dataHook.renderResultUrl,
    renderResultFilename: dataHook.renderResultFilename,
    undo: dataHook.undo,
    redo: dataHook.redo,
    canUndo: dataHook.canUndo,
    canRedo: dataHook.canRedo,
    checkpoints: dataHook.checkpoints,
    jumpToCheckpoint: dataHook.jumpToCheckpoint,
    createManualCheckpoint: dataHook.createManualCheckpoint,
    setScaleWidth: dataHook.setScaleWidth,
    handleAddTrack: trackManagement.handleAddTrack,
    handleClearUnusedTracks: trackManagement.handleClearUnusedTracks,
    unusedTrackCount: trackManagement.unusedTrackCount,
    handleAddText: clipEditing.handleAddText,
    handleAddTextAt: clipEditing.handleAddTextAt,
    reloadFromServer: dataHook.reloadFromServer,
    retrySaveAfterConflict: dataHook.retrySaveAfterConflict,
    startRender: dataHook.startRender,
  }), [
    runtime.timelineName,
    dataHook.isConflictExhausted,
    dataHook.reloadFromServer,
    dataHook.retrySaveAfterConflict,
    dataHook.renderDirty,
    dataHook.renderLog,
    dataHook.renderProgress,
    dataHook.renderResultFilename,
    dataHook.renderResultUrl,
    dataHook.renderStatus,
    dataHook.saveStatus,
    dataHook.setScaleWidth,
    dataHook.startRender,
    dataHook.undo,
    dataHook.redo,
    dataHook.canUndo,
    dataHook.canRedo,
    dataHook.checkpoints,
    dataHook.jumpToCheckpoint,
    dataHook.createManualCheckpoint,
    clipEditing.handleAddText,
    clipEditing.handleAddTextAt,
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
