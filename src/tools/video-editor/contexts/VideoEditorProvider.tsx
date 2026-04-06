import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MediaLightbox } from '@/domains/media-lightbox/MediaLightbox';
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
import { loadGenerationForLightbox } from '@/tools/video-editor/lib/generation-utils';
import { useRenderDiagnostic } from '@/tools/video-editor/hooks/usePerfDiagnostics';

function InnerProvider({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId: string;
}) {
  useRenderDiagnostic('VideoEditorProvider');
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
  const [lightboxAssetKey, setLightboxAssetKey] = useState<string | null>(null);
  const lightboxAsset = lightboxAssetKey ? editor.resolvedConfig?.registry[lightboxAssetKey] : undefined;
  const lightboxGenerationId = lightboxAsset?.generationId ?? null;
  const lightboxQuery = useQuery({
    queryKey: ['video-editor', 'lightbox', lightboxGenerationId],
    queryFn: () => loadGenerationForLightbox(lightboxGenerationId as string),
    enabled: Boolean(lightboxGenerationId),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!lightboxAssetKey || !lightboxGenerationId || lightboxQuery.isLoading || lightboxQuery.data) {
      return;
    }

    console.warn('[VideoEditorProvider] Lightbox auto-closing: no data for generation', lightboxGenerationId);
    setLightboxAssetKey(null);
  }, [lightboxAssetKey, lightboxGenerationId, lightboxQuery.data, lightboxQuery.isLoading]);

  const onDoubleClickAsset = useCallback((assetKey: string) => {
    const entry = editor.resolvedConfig?.registry[assetKey];
    if (!entry?.generationId) {
      console.warn('[VideoEditorProvider] Double-click: no generationId for asset', assetKey, entry);
      return;
    }

    console.log('[VideoEditorProvider] Opening lightbox for', assetKey, 'generationId:', entry.generationId, 'type:', entry.type);
    setLightboxAssetKey(assetKey);
  }, [editor.resolvedConfig]);

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
    handleDetachAudioClip: editor.handleDetachAudioClip,
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
    setLightboxAssetKey,
  }), [editor, onDoubleClickAsset, setLightboxAssetKey]);

  return (
    <TimelineEditorDataContextProvider value={editorData}>
      <TimelineEditorOpsContextProvider value={editorOps}>
        <TimelineChromeContextProvider value={chrome}>
          <TimelinePlaybackContextProvider value={playback}>
            {children}
            {lightboxAssetKey && lightboxQuery.data && (
              <MediaLightbox
                media={lightboxQuery.data}
                initialVariantId={lightboxAsset?.variantId ?? lightboxQuery.data.primary_variant_id ?? undefined}
                onClose={() => setLightboxAssetKey(null)}
                features={{ showDownload: true, showTaskDetails: true }}
              />
            )}
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
