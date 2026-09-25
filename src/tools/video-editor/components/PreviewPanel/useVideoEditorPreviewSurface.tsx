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
import { resolveCanonicalComposition } from '@/tools/video-editor/data/canonicalCompositionState.ts';

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
  // Interactive preview should reflect an in-progress child-shot edit before
  // its canonical publication is acknowledged. Export/save still consume the
  // acknowledged composition through their own paths.
  const previewComposition = runtime?.userId === null
    ? runtime.shots?.canonicalDraft?.composition ?? runtime.shots?.canonicalComposition
    : null;
  const compositionResolution = useMemo(() => resolveCanonicalComposition({
    userId: runtime?.userId,
    hasShotClips,
    hasShotComposition: Boolean(runtime?.shots?.shotComposition),
    composition: previewComposition,
    compositionError: runtime?.userId === null ? runtime.shots?.canonicalCompositionError : null,
    baseConfig: resolvedConfig,
  }), [hasShotClips, previewComposition, resolvedConfig, runtime?.shots?.canonicalCompositionError,
    runtime?.shots?.shotComposition, runtime?.userId]);
  const previewConfig = compositionResolution.config;
  const previewSource = compositionResolution.source;
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
