import type { ReactPortal } from 'react';
import { createPortal } from 'react-dom';
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  type RefCallback,
} from 'react';
import { shallow } from 'zustand/shallow';
import { RemotionPreview } from '@/tools/video-editor/components/PreviewPanel/RemotionPreview.tsx';
import { useTimelineDataSelector, useTimelinePlaybackSelector } from '@/tools/video-editor/hooks/timelineStore.ts';
import { useOptionalVideoEditorRuntime } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import { projectCanonicalComposition } from '@/tools/video-editor/data/shotCompositionProjection.ts';

export interface VideoEditorPreviewSurface {
  slotRef: RefCallback<HTMLDivElement>;
  portal: ReactPortal | null;
  hasConfig: boolean;
}

export function useVideoEditorPreviewSurface({
  compact = false,
  touchChrome = false,
}: {
  compact?: boolean;
  touchChrome?: boolean;
} = {}): VideoEditorPreviewSurface {
  const resolvedConfig = useTimelineDataSelector((timeline) => timeline.resolvedConfig);
  const runtime = useOptionalVideoEditorRuntime();
  const hasShotClips = Boolean(resolvedConfig?.clips.some((clip) => clip.clipType === 'shot'));
  const canonicalProviderActive = runtime?.userId === null
    && Boolean(runtime.shots.shotComposition)
    && hasShotClips;
  const canonicalComposition = runtime?.userId === null
    ? runtime.shots.canonicalComposition
    : null;
  // Do not briefly mount the legacy parent config while Runtime is still
  // loading the pinned child timelines. That config contains the shot shells
  // but not their internal media, so switching a live Player from it to the
  // flattened canonical config can leave Remotion with the old duration and
  // audio lifecycle. Ordinary media timelines continue to use their legacy
  // config because they have no shot clips to hydrate.
  const canonicalCompositionPending = canonicalProviderActive
    && !canonicalComposition
    && !runtime.shots.canonicalCompositionError;
  // The Runtime provider exposes the shot-composition port for every document,
  // including ordinary media timelines. Only replace the legacy resolved
  // config when this particular document actually has a prepared canonical
  // shot composition; otherwise a non-shot timeline would lose its preview
  // surface even though its normal config is valid.
  const canonicalLane = runtime?.userId === null && Boolean(canonicalComposition);
  const projectedConfig = useMemo(() => {
    if (!canonicalLane || !canonicalComposition) return null;
    try {
      return projectCanonicalComposition(canonicalComposition, resolvedConfig).config;
    } catch {
      // Canonical preview is fail-closed. A malformed/unsupported child must
      // never fall back to the legacy timeline projection.
      return null;
    }
  }, [canonicalComposition, canonicalLane, resolvedConfig]);
  const previewConfig = canonicalCompositionPending
    ? null
    : canonicalLane
      ? projectedConfig
      : resolvedConfig;
  const previewSource = canonicalLane ? 'canonical' : 'legacy';
  const {
    currentTime,
    previewRef,
    playerContainerRef,
    onPreviewTimeUpdate,
  } = useTimelinePlaybackSelector((playback) => ({
    currentTime: playback.currentTime,
    previewRef: playback.previewRef,
    playerContainerRef: playback.playerContainerRef,
    onPreviewTimeUpdate: playback.onPreviewTimeUpdate,
  }), shallow);
  const [slotNode, setSlotNode] = useState<HTMLDivElement | null>(null);
  const [hostNode] = useState<HTMLDivElement | null>(() => {
    if (typeof document === 'undefined') {
      return null;
    }

    const host = document.createElement('div');
    host.style.display = 'contents';
    return host;
  });

  const slotRef = useCallback<RefCallback<HTMLDivElement>>((node) => {
    setSlotNode(node);
  }, []);

  useLayoutEffect(() => {
    if (!hostNode) {
      return;
    }

    if (!previewConfig || !slotNode) {
      hostNode.remove();
      return () => {
        hostNode.remove();
      };
    }

    if (hostNode.parentElement !== slotNode) {
      slotNode.appendChild(hostNode);
    }

    return () => {
      hostNode.remove();
    };
  }, [hostNode, previewConfig, slotNode]);

  const portal = useMemo(() => {
    if (!hostNode || !previewConfig) {
      return null;
    }

    return createPortal(
      <RemotionPreview
        key={previewSource}
        ref={previewRef}
        config={previewConfig}
        compact={compact}
        touchChrome={touchChrome}
        initialTime={currentTime}
        currentTime={currentTime}
        onTimeUpdate={onPreviewTimeUpdate}
        playerContainerRef={playerContainerRef}
      />,
      hostNode,
    );
  }, [
    compact,
    currentTime,
    touchChrome,
    hostNode,
    onPreviewTimeUpdate,
    playerContainerRef,
    previewRef,
    previewConfig,
    previewSource,
  ]);

  return useMemo(() => ({
    slotRef,
    portal,
    hasConfig: Boolean(previewConfig),
  }), [portal, previewConfig, slotRef]);
}
