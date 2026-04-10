import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsMobile, useIsTablet } from '@/shared/hooks/mobile';
import { createInteractionState } from '@/tools/video-editor/lib/interaction-state';
import { useGallerySelection } from '@/shared/contexts/GallerySelectionContext';
import { useProjectSelectionContext } from '@/shared/contexts/ProjectContext';
import { useVideoEditorRuntime } from '@/tools/video-editor/contexts/DataProviderContext';
import { ROW_HEIGHT, TIMELINE_START_LEFT } from '@/tools/video-editor/lib/coordinate-utils';
import { useAssetManagement } from '@/tools/video-editor/hooks/useAssetManagement';
import { useAssetOperations } from '@/tools/video-editor/hooks/useAssetOperations';
import { useClipEditing } from '@/tools/video-editor/hooks/useClipEditing';
import { useClipResize } from '@/tools/video-editor/hooks/useClipResize';
import { useDerivedTimeline } from '@/tools/video-editor/hooks/useDerivedTimeline';
import { useDragCoordinator } from '@/tools/video-editor/hooks/useDragCoordinator';
import { useEditorPreferences } from '@/tools/video-editor/hooks/useEditorPreferences';
import { useExternalDrop } from '@/tools/video-editor/hooks/useExternalDrop';
import { useTimelinePlayback } from '@/tools/video-editor/hooks/useTimelinePlayback';
import { useRenderState } from '@/tools/video-editor/hooks/useRenderState';
import { useTimelineHistory } from '@/tools/video-editor/hooks/useTimelineHistory';
import { useTimelineQueries } from '@/tools/video-editor/hooks/useTimelineQueries';
import { useTimelineSave } from '@/tools/video-editor/hooks/useTimelineSave';
import { useTimelineSelection } from '@/tools/video-editor/hooks/useTimelineSelection';
import {
  useTimelineChromeContextValue,
  useTimelineEditorContextValue,
  useTimelinePlaybackContextValue,
} from '@/tools/video-editor/hooks/useTimelineState.contexts';
import type { UseTimelineStateResult } from '@/tools/video-editor/hooks/useTimelineState.types';
import {
  createMobileInteractionPolicy,
  getDefaultInteractionMode,
  resolveInputModalityFromPointerType,
  resolveTimelineDeviceClass,
} from '@/tools/video-editor/lib/mobile-interaction-model';
import { useTimelineTrackManagement } from '@/tools/video-editor/hooks/useTimelineTrackManagement';

export type { EditorPreferences } from '@/tools/video-editor/hooks/useEditorPreferences';
export type { RenderStatus } from '@/tools/video-editor/hooks/useRenderState';
export type { SaveStatus } from '@/tools/video-editor/hooks/useTimelineSave';

export function useTimelineState(): UseTimelineStateResult {
  const runtime = useVideoEditorRuntime();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const playback = useTimelinePlayback();
  const preferences = useEditorPreferences(runtime.timelineId);
  const queries = useTimelineQueries(runtime.provider, runtime.timelineId);
  // Shared gate observed by drag/resize writers and read by save/persistence/poll.
  const interactionStateRef = useRef(createInteractionState());
  const deviceClass = useMemo(
    () => resolveTimelineDeviceClass({ isMobile, isTablet }),
    [isMobile, isTablet],
  );
  const defaultInteractionMode = getDefaultInteractionMode(deviceClass);
  const initialInteractionPolicyRef = useRef(createMobileInteractionPolicy(deviceClass));
  const previousDefaultInteractionModeRef = useRef(defaultInteractionMode);
  const [inputModality, setInputModality] = useState(initialInteractionPolicyRef.current.inputModality);
  const [interactionMode, setInteractionMode] = useState(initialInteractionPolicyRef.current.interactionMode);
  const [gestureOwner, setGestureOwner] = useState(initialInteractionPolicyRef.current.gestureOwner);
  const [precisionEnabled, setPrecisionEnabled] = useState(initialInteractionPolicyRef.current.precisionEnabled);
  const [contextTarget, setContextTarget] = useState(initialInteractionPolicyRef.current.contextTarget);
  const [inspectorTarget, setInspectorTarget] = useState(initialInteractionPolicyRef.current.inspectorTarget);
  const save = useTimelineSave(queries, runtime.provider, interactionStateRef);
  const history = useTimelineHistory({
    dataRef: save.dataRef,
    commitData: save.commitData,
  });
  const derived = useDerivedTimeline(save.data, save.selectedClipId, save.selectedTrackId);
  const render = useRenderState(derived.resolvedConfig, derived.renderMetadata);
  const assetOperations = useAssetOperations(
    runtime.provider,
    runtime.timelineId,
    runtime.userId,
    queryClient,
    save.pendingOpsRef,
  );
  const {
    data,
    dataRef,
    eventBus,
    isConflictExhausted,
    selectedClipId,
    selectedTrackId,
    saveStatus,
    setSelectedClipId,
    setSelectedTrackId,
    applyEdit,
    patchRegistry,
    reloadFromServer,
    retrySaveAfterConflict,
    pendingOpsRef,
    isLoading,
  } = save;
  const {
    resolvedConfig,
    compositionSize,
    trackScaleMap,
  } = derived;
  const {
    renderStatus,
    renderLog,
    renderDirty,
    renderProgress,
    renderResultUrl,
    renderResultFilename,
    setRenderDirty,
    startRender,
  } = render;
  const {
    canUndo,
    canRedo,
    checkpoints,
    undo,
    redo,
    jumpToCheckpoint,
    createManualCheckpoint,
    onBeforeCommit,
  } = history;
  const {
    scale,
    scaleWidth,
    preferences: editorPreferences,
    setScaleWidth,
    setActiveClipTab,
    setAssetPanelState,
  } = preferences;
  const {
    registerAsset,
    uploadAsset,
    uploadFiles,
    invalidateAssetRegistry,
  } = assetOperations;
  const { selectedProjectId } = useProjectSelectionContext();
  const { clearGallerySelection, registerPeerClear } = useGallerySelection();
  const selection = useTimelineSelection({
    data,
    selectedClipId,
    selectedTrackId,
    setSelectedClipId,
    clearGallerySelection,
    registerPeerClear,
  });
  const setInputModalityFromPointerType = useCallback((pointerType: string | null | undefined) => {
    const nextModality = resolveInputModalityFromPointerType(pointerType);
    setInputModality(nextModality);
    return nextModality;
  }, []);

  const interactionPolicy = useMemo(() => ({
    deviceClass,
    inputModality,
    interactionMode,
    gestureOwner,
    precisionEnabled,
    contextTarget,
    inspectorTarget,
  }), [
    contextTarget,
    deviceClass,
    gestureOwner,
    inputModality,
    inspectorTarget,
    interactionMode,
    precisionEnabled,
  ]);

  useEffect(() => {
    return eventBus.on('beforeCommit', onBeforeCommit);
  }, [eventBus, onBeforeCommit]);

  useEffect(() => {
    return eventBus.on('pruneSelection', selection.pruneSelection);
  }, [eventBus, selection.pruneSelection]);

  useEffect(() => {
    return eventBus.on('saveSuccess', () => {
      setRenderDirty(true);
    });
  }, [eventBus, setRenderDirty]);

  useEffect(() => {
    setInteractionMode((currentMode) => (
      currentMode === previousDefaultInteractionModeRef.current
        ? defaultInteractionMode
        : currentMode
    ));
    previousDefaultInteractionModeRef.current = defaultInteractionMode;
  }, [defaultInteractionMode]);

  const dragCoordinator = useDragCoordinator({
    dataRef,
    scale,
    scaleWidth,
    startLeft: TIMELINE_START_LEFT,
    rowHeight: ROW_HEIGHT,
  });

  const assetManagement = useAssetManagement({
    dataRef,
    selectedTrackId,
    selectedProjectId,
    setSelectedClipId: selection.setSelectedClipId,
    setSelectedTrackId,
    applyEdit,
    patchRegistry,
    registerAsset,
    uploadAsset,
    invalidateAssetRegistry,
    resolveAssetUrl: runtime.provider.resolveAssetUrl.bind(runtime.provider),
  });

  const clipResize = useClipResize({
    dataRef,
    applyEdit,
  });

  const clipEditing = useClipEditing({
    dataRef,
    resolvedConfig: selection.resolvedConfig,
    selectedClipId: selection.primaryClipId,
    selectedTrack: selection.selectedTrack,
    currentTime: playback.currentTime,
    setSelectedClipId: selection.setSelectedClipId,
    setSelectedTrackId,
    applyEdit,
  });

  const externalDrop = useExternalDrop({
    dataRef,
    pendingOpsRef,
    scale,
    scaleWidth,
    selectedTrackId,
    applyEdit,
    patchRegistry,
    registerAsset,
    uploadAsset,
    invalidateAssetRegistry,
    resolveAssetUrl: runtime.provider.resolveAssetUrl.bind(runtime.provider),
    coordinator: dragCoordinator.coordinator,
    registerGenerationAsset: assetManagement.registerGenerationAsset,
    uploadImageGeneration: assetManagement.uploadImageGeneration,
    uploadVideoGeneration: assetManagement.uploadVideoGeneration,
    handleAssetDrop: assetManagement.handleAssetDrop,
    handleAddTextAt: clipEditing.handleAddTextAt,
    onSeekToTime: playback.onClickTimeArea,
  });

  const trackManagement = useTimelineTrackManagement({
    dataRef,
    resolvedConfig: selection.resolvedConfig,
    selectedClipId: selection.primaryClipId,
    setSelectedTrackId,
    applyEdit,
  });

  const editor = useTimelineEditorContextValue({
    data,
    interactionPolicy,
    selection,
    selectedTrackId,
    compositionSize,
    trackScaleMap,
    scale,
    scaleWidth,
    isLoading,
    dataRef,
    pendingOpsRef,
    interactionStateRef,
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
    setInputModality,
    setInputModalityFromPointerType,
    setInteractionMode,
    setGestureOwner,
    setPrecisionEnabled,
    setContextTarget,
    setInspectorTarget,
  });

  const chrome = useTimelineChromeContextValue({
    timelineName: runtime.timelineName ?? null,
    saveStatus,
    isConflictExhausted,
    render: {
      renderStatus,
      renderLog,
      renderDirty,
      renderProgress,
      renderResultUrl,
      renderResultFilename,
    },
    history: {
      undo,
      redo,
      canUndo,
      canRedo,
      checkpoints,
      jumpToCheckpoint,
      createManualCheckpoint,
    },
    setScaleWidth,
    trackManagement: {
      handleAddTrack: trackManagement.handleAddTrack,
      handleClearUnusedTracks: trackManagement.handleClearUnusedTracks,
      unusedTrackCount: trackManagement.unusedTrackCount,
    },
    clipEditing: {
      handleAddText: clipEditing.handleAddText,
      handleAddTextAt: clipEditing.handleAddTextAt,
    },
    reloadFromServer,
    retrySaveAfterConflict,
    startRender,
  });

  const playbackValue = useTimelinePlaybackContextValue({ playback });

  return {
    editor,
    chrome,
    playback: playbackValue,
  };
}
