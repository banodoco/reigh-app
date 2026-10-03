import { Component, lazy, memo, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { RemotionPreview } from '@/tools/video-editor/components/PreviewPanel/RemotionPreview.tsx';
import { TimelineEditorCoreBody } from '@/tools/video-editor/components/TimelineEditor/TimelineEditorCoreBody.tsx';
import { PUBLIC_TIMELINE_OBSERVATIONS } from '@/tools/video-editor/runtime/editorHostObservations.ts';
import { useRequiredEffectCatalog } from '@/tools/video-editor/runtime/catalogContexts.tsx';
import { useTimelineEditorData, useTimelinePlaybackContext } from '@/tools/video-editor/hooks/timelineStore.ts';
import { userSelectTimelineClip } from '@/shared/state/selectionStore.ts';
import { usePublicAstridExample } from './publicAstridExample.tsx';

function usePublicAstridTimelineObservations() {
  const {silentVideoWaveformAssetHashes} = usePublicAstridExample();
  return useMemo(() => Object.freeze({
    ...PUBLIC_TIMELINE_OBSERVATIONS,
    silentVideoWaveformAssetHashes,
  }), [silentVideoWaveformAssetHashes]);
}

const LazyPropertiesPanelBody = lazy(async () => {
  const module = await import('@/tools/video-editor/components/PropertiesPanel/PropertiesPanelBody.tsx');
  return { default: module.PropertiesPanelBody };
});

class InspectorChunkBoundary extends Component<{children: ReactNode}, {hasError: boolean}> {
  state = {hasError: false};

  static getDerivedStateFromError() {
    return {hasError: true};
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="astrid-inspector-load-error" data-astrid-inspector-ready="error" role="alert">
          <span>The inspector could not be loaded.</span>
          <button type="button" onClick={() => window.location.reload()}>Reload to try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Mount these siblings under one PublicAstridEditorProvider. The heavy parts are memoised: they read their
 * data from context, so switching App/Agent (which re-renders the mounted editor) doesn't re-render them.
 */
export const PublicAstridPreview = memo(function PublicAstridPreview({transportOutlet}: {transportOutlet: HTMLElement | null}) {
  const example = usePublicAstridExample();
  const {resolvedConfig} = useTimelineEditorData();
  const {currentTime, previewRef, playerContainerRef, onPreviewTimeUpdate} = useTimelinePlaybackContext();
  if (!resolvedConfig) return <div aria-label={`Loading ${example.metadata.title} preview`} />;
  return (
    <RemotionPreview
      ref={previewRef}
      config={resolvedConfig}
      initialTime={currentTime}
      currentTime={currentTime}
      onTimeUpdate={onPreviewTimeUpdate}
      playerContainerRef={playerContainerRef}
      transportOutlet={transportOutlet}
      touchChrome
    />
  );
});

export const PublicAstridTimeline = memo(function PublicAstridTimeline() {
  const hostObservations = usePublicAstridTimelineObservations();
  // Public preview targets are touch sized; other app timelines retain the
  // shared editor's existing 36px geometry.
  return <TimelineEditorCoreBody hostObservations={hostObservations} rowHeight={52} />;
});

/** Start with the first real asset selected so the App view opens on useful inspector data. */
export function PublicAstridInitialSelection() {
  const {resolvedConfig, selectedClipId} = useTimelineEditorData();
  useEffect(() => {
    const firstClip = resolvedConfig?.clips[0];
    if (!firstClip || selectedClipId) return;
    const frame = window.requestAnimationFrame(() => userSelectTimelineClip(firstClip.id, { additive: false }));
    return () => window.cancelAnimationFrame(frame);
  }, [resolvedConfig, selectedClipId]);
  return null;
}

/** Perspective changes pause without rewinding; returning to App waits for explicit Play. */
export function PublicAstridPlaybackCoordinator({audience}: {audience: 'app' | 'agent'}) {
  const {previewRef} = useTimelinePlaybackContext();
  const previousAudience = useRef(audience);
  useEffect(() => {
    if (previousAudience.current === 'app' && audience === 'agent') previewRef.current?.pause();
    previousAudience.current = audience;
  }, [audience, previewRef]);
  return null;
}

export const PublicAstridInspector = memo(function PublicAstridInspector() {
  const hostObservations = usePublicAstridTimelineObservations();
  const effectResources = useRequiredEffectCatalog();
  return (
    <Suspense fallback={(
      <div className="astrid-inspector-loading" data-astrid-inspector-ready="false" role="status" aria-live="polite">
        Loading inspector…
      </div>
    )}>
      <InspectorChunkBoundary>
        <div className="astrid-inspector-panel-frame" data-astrid-inspector-ready="true">
        <LazyPropertiesPanelBody hostObservations={hostObservations} effectResources={effectResources} />
        </div>
      </InspectorChunkBoundary>
    </Suspense>
  );
});
