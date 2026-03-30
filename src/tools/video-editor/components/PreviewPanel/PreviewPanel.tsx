import { memo, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MediaLightbox } from '@/domains/media-lightbox/MediaLightbox';
import OverlayEditor from '@/tools/video-editor/components/PreviewPanel/OverlayEditor';
import { RemotionPreview } from '@/tools/video-editor/components/PreviewPanel/RemotionPreview';
import { useTimelineEditorContext } from '@/tools/video-editor/contexts/TimelineEditorContext';
import { useTimelinePlaybackContext } from '@/tools/video-editor/contexts/TimelinePlaybackContext';
import { loadGenerationForLightbox } from '@/tools/video-editor/lib/generation-utils';

function PreviewPanelComponent() {
  const {
    data,
    resolvedConfig,
    trackScaleMap,
    compositionSize,
    selectedClipId,
    setSelectedClipId,
    onOverlayChange,
    registerLightboxHandler,
  } = useTimelineEditorContext();
  const [lightboxAssetKey, setLightboxAssetKey] = useState<string | null>(null);
  const {
    previewRef,
    playerContainerRef,
    currentTime,
    onPreviewTimeUpdate,
  } = useTimelinePlaybackContext();

  const lightboxAsset = lightboxAssetKey ? resolvedConfig?.registry[lightboxAssetKey] : undefined;
  const lightboxGenerationId = lightboxAsset?.generationId ?? null;
  const lightboxQuery = useQuery({
    queryKey: ['video-editor', 'preview-lightbox', lightboxGenerationId],
    queryFn: () => loadGenerationForLightbox(lightboxGenerationId as string),
    enabled: Boolean(lightboxGenerationId),
    staleTime: 60_000,
  });

  // Register this panel's lightbox opener so timeline clips can trigger it too
  useEffect(() => {
    const handler = (assetKey: string) => {
      if (!resolvedConfig?.registry[assetKey]?.generationId) return;
      setLightboxAssetKey(assetKey);
    };
    registerLightboxHandler?.(handler);
    return () => registerLightboxHandler?.(null);
  }, [registerLightboxHandler, resolvedConfig]);

  useEffect(() => {
    if (!lightboxAssetKey || !lightboxGenerationId || lightboxQuery.isLoading || lightboxQuery.data) {
      return;
    }

    setLightboxAssetKey(null);
  }, [lightboxAssetKey, lightboxGenerationId, lightboxQuery.data, lightboxQuery.isLoading]);

  if (!data || !resolvedConfig) {
    return null;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card/80">
      <div className="relative flex min-h-0 flex-1">
        <div
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-background"
          onMouseDownCapture={(event) => {
            const target = event.target;
            if (!(target instanceof Element)) {
              return;
            }

            if (target.closest("[data-overlay-hit='true'], [data-inline-text-editor='true']")) {
              return;
            }

            setSelectedClipId(null);
          }}
        >
          <RemotionPreview
            ref={previewRef}
            config={resolvedConfig}
            initialTime={currentTime}
            onTimeUpdate={onPreviewTimeUpdate}
            playerContainerRef={playerContainerRef}
          />
          <OverlayEditor
            rows={data.rows}
            meta={data.meta}
            registry={resolvedConfig.registry}
            currentTime={currentTime}
            playerContainerRef={playerContainerRef}
            trackScaleMap={trackScaleMap}
            compositionWidth={compositionSize.width}
            compositionHeight={compositionSize.height}
            selectedClipId={selectedClipId}
            onSelectClip={setSelectedClipId}
            onOverlayChange={onOverlayChange}
            onDoubleClickAsset={(assetKey) => {
              if (!resolvedConfig.registry[assetKey]?.generationId) return;
              setLightboxAssetKey(assetKey);
            }}
          />
        </div>
      </div>
      {lightboxAssetKey && lightboxQuery.data && (
        <MediaLightbox
          media={lightboxQuery.data}
          initialVariantId={lightboxAsset?.variantId ?? lightboxQuery.data.primary_variant_id ?? undefined}
          onClose={() => setLightboxAssetKey(null)}
          readOnly
          features={{ showDownload: true }}
        />
      )}
    </div>
  );
}

export const PreviewPanel = memo(PreviewPanelComponent);
