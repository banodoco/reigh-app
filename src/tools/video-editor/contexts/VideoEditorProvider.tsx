import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MediaLightbox } from '@/domains/media-lightbox/MediaLightbox';
import type { GenerationRow } from '@/domains/generation/types';
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
  TimelineActionResizeStart,
  TimelineClipEdgeResizeEnd,
  TimelineEditorDataContextValue,
  TimelineEditorOpsContextValue,
} from '@/tools/video-editor/hooks/useTimelineState.types';
import { loadGenerationForLightbox } from '@/tools/video-editor/lib/generation-utils';
import { useRenderDiagnostic } from '@/tools/video-editor/hooks/usePerfDiagnostics';
import type { ResolvedAssetRegistryEntry } from '@/tools/video-editor/types';

const log = import.meta.env.DEV ? (...args: Parameters<typeof console.log>) => console.log(...args) : () => {};

function isOpenableAssetType(type: string | undefined, url: string | undefined): boolean {
  if (typeof type === 'string' && (type.startsWith('video/') || type.startsWith('image/'))) {
    return true;
  }

  if (!url) {
    return false;
  }

  return /\.(mp4|mov|webm|m4v|png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(url);
}

export function buildVideoEditorLightboxMedia(
  assetKey: string | null,
  asset: ResolvedAssetRegistryEntry | undefined,
): GenerationRow | null {
  if (!assetKey || !asset) {
    return null;
  }

  const src = asset.src || asset.file;
  if (!src || !isOpenableAssetType(asset.type, src)) {
    return null;
  }

  const isVideo = asset.type?.startsWith('video/')
    || /\.(mp4|mov|webm|m4v)(\?.*)?$/i.test(src);

  return {
    id: assetKey,
    generation_id: asset.generationId || assetKey,
    location: src,
    imageUrl: src,
    thumbUrl: asset.thumbnailUrl || src,
    type: isVideo ? 'video' : 'image',
    primary_variant_id: asset.variantId || null,
    name: asset.file,
  };
}

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
  const lightboxFallbackMedia = useMemo(
    () => buildVideoEditorLightboxMedia(lightboxAssetKey, lightboxAsset),
    [lightboxAsset, lightboxAssetKey],
  );
  const lightboxGenerationId = lightboxAsset?.generationId ?? null;
  const lightboxQuery = useQuery({
    queryKey: ['video-editor', 'lightbox', lightboxGenerationId],
    queryFn: () => loadGenerationForLightbox(lightboxGenerationId as string),
    enabled: Boolean(lightboxGenerationId),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (
      !lightboxAssetKey
      || !lightboxGenerationId
      || lightboxQuery.isLoading
      || lightboxQuery.data
      || lightboxFallbackMedia
    ) {
      return;
    }

    log('[video-editor] lightbox query returned no data; clearing asset key', {
      assetKey: lightboxAssetKey,
      generationId: lightboxGenerationId,
    });
    setLightboxAssetKey(null);
  }, [lightboxAssetKey, lightboxFallbackMedia, lightboxGenerationId, lightboxQuery.data, lightboxQuery.isLoading]);

  const onDoubleClickAsset = useCallback((assetKey: string) => {
    const asset = editor.resolvedConfig?.registry[assetKey];
    log('[video-editor] onDoubleClickAsset', {
      assetKey,
      hasAsset: Boolean(asset),
      generationId: asset?.generationId ?? null,
      file: asset?.file ?? null,
      type: asset?.type ?? null,
    });
    if (!buildVideoEditorLightboxMedia(assetKey, asset)) {
      return;
    }

    setLightboxAssetKey(assetKey);
  }, [editor.resolvedConfig]);

  useEffect(() => {
    if (!lightboxAssetKey) {
      return;
    }

    log('[video-editor] lightbox state', {
      assetKey: lightboxAssetKey,
      generationId: lightboxGenerationId,
      isLoading: lightboxQuery.isLoading,
      hasData: Boolean(lightboxQuery.data),
      hasFallbackMedia: Boolean(lightboxFallbackMedia),
      mediaId: lightboxQuery.data?.id ?? null,
      mediaType: lightboxQuery.data?.type ?? null,
      mediaLocation: lightboxQuery.data?.location ?? null,
    });
  }, [lightboxAssetKey, lightboxFallbackMedia, lightboxGenerationId, lightboxQuery.data, lightboxQuery.isLoading]);

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
    interactionStateRef: editor.interactionStateRef,
    coordinator: editor.coordinator,
    indicatorRef: editor.indicatorRef,
    editAreaRef: editor.editAreaRef,
    preferences: editor.preferences,
    timelineRef: editor.timelineRef,
    timelineWrapperRef: editor.timelineWrapperRef,
  }), [editor]);

  const onActionResizeStart: TimelineActionResizeStart = editor.onActionResizeStart;
  const onClipEdgeResizeEnd: TimelineClipEdgeResizeEnd = editor.onClipEdgeResizeEnd;

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
    onActionResizeStart,
    onClipEdgeResizeEnd,
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
  }), [editor, onActionResizeStart, onClipEdgeResizeEnd, onDoubleClickAsset, setLightboxAssetKey]);

  const resolvedLightboxMedia = lightboxQuery.data ?? lightboxFallbackMedia;

  return (
    <TimelineEditorDataContextProvider value={editorData}>
      <TimelineEditorOpsContextProvider value={editorOps}>
        <TimelineChromeContextProvider value={chrome}>
          <TimelinePlaybackContextProvider value={playback}>
            {children}
            {lightboxAssetKey && resolvedLightboxMedia && (
              <MediaLightbox
                media={resolvedLightboxMedia}
                initialVariantId={lightboxAsset?.variantId ?? resolvedLightboxMedia.primary_variant_id ?? undefined}
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
