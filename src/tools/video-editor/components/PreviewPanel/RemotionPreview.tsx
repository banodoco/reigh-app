import type { RefObject } from 'react';
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pause, Play, SkipBack } from 'lucide-react';
import { Player, type PlayerRef } from '@remotion/player';
import { Button } from '@/shared/components/ui/button.tsx';
import { cn } from '@/shared/components/ui/contracts/cn.ts';
import { TimelineRenderer } from '@/tools/video-editor/compositions/TimelineRenderer.tsx';
import { useEffectDiagnostic, useRenderDiagnostic } from '@/tools/video-editor/hooks/usePerfDiagnostics.ts';
import { getClipDurationInFrames, parseResolution, secondsToFrames } from '@/tools/video-editor/lib/config-utils.ts';
import { VIDEO_EDITOR_THEME_VARS } from '@/tools/video-editor/lib/themeTokens.ts';
import type { ResolvedTimelineConfig } from '@/tools/video-editor/types/index.ts';
import { useOptionalVideoEditorRuntime } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import { useOptionalPreviewMediaFailure } from '@/tools/video-editor/compositions/PreviewMediaFailureContext.tsx';

export interface PreviewHandle {
  seek: (time: number) => void;
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  readonly isPlaying: boolean;
}

const TRANSPORT_BUTTON_CLASS = 'pointer-events-auto rounded-full border-[color:var(--video-editor-stage-control-border)] bg-[var(--video-editor-stage-control-bg)] text-[color:var(--video-editor-stage-fg)] hover:bg-[var(--video-editor-stage-control-bg-hover)]';
// The editor preview flattens every shot's internal audio clip into the
// parent composition. Remotion's shared-tag scheduler is optimized for a
// small number of simultaneously mounted tags and can reuse a tag with the
// wrong clip while a long timeline is being sought. Let each active Sequence
// own its media element instead; this keeps source identity and timing local
// to the clip and avoids a lifetime-fixed shared-pool prop during config swaps.
const PREVIEW_SHARED_AUDIO_TAGS = 0;

interface PendingSeek {
  time: number;
  configGeneration: number;
}

interface TestPlayerSeekObserver {
  onDispatch?: (event: { time: number; frame: number; configGeneration: number }) => void;
  onAutoResume?: () => void;
}

interface RemotionPreviewProps {
  config: ResolvedTimelineConfig;
  onTimeUpdate: (time: number) => void;
  playerContainerRef: RefObject<HTMLDivElement>;
  compact?: boolean;
  /** Phone/tablet chrome: transport controls grow to touch-sized hit targets. */
  touchChrome?: boolean;
  /** Public shell outlet keeps controls on a stable 2D plane above the deconstructing preview. */
  transportOutlet?: HTMLElement | null;
  initialTime?: number;
  /** @deprecated Compatibility only; ignored. Use initialTime or PreviewHandle.seek. */
  currentTime?: number;
}

const RemotionPreviewComponent = forwardRef<PreviewHandle, RemotionPreviewProps>(function RemotionPreview(
  { config, onTimeUpdate, playerContainerRef, compact = false, touchChrome = false, transportOutlet, initialTime = 0 },
  ref,
) {
  const playerRef = useRef<PlayerRef>(null);
  const previewMediaFailure = useOptionalPreviewMediaFailure();
  const astridElementHost = useOptionalVideoEditorRuntime()?.astridElementHost;
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackIntentRef = useRef<'playing' | 'paused'>('paused');
  const activeSeekRef = useRef<PendingSeek | null>(null);
  const pendingSeekRef = useRef<PendingSeek | null>(null);
  const seekFlushRafRef = useRef<number | null>(null);
  const configIdentityRef = useRef(config);
  const configGenerationRef = useRef(0);
  if (configIdentityRef.current !== config) {
    configIdentityRef.current = config;
    configGenerationRef.current += 1;
  }
  useRenderDiagnostic('RemotionPreview');
  const markEventsEffect = useEffectDiagnostic('remotionPreview:events');
  // Throttle config updates to the Player to avoid stutter during drag operations.
  // The timeline canvas shows immediate visual feedback; the Player catches up after 150ms idle.
  const [deferredConfigState, setDeferredConfigState] = useState({ config, generation: 0 });
  const deferredConfig = deferredConfigState.config;
  const deferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Live-edit mailbox: while playing, timeline edits must reach the Player on
  // the next animation frame (live media updates, no pause+restart), but no
  // more than once per frame so rapid commits can't cause renderer jank.
  const latestConfigRef = useRef<{ config: ResolvedTimelineConfig; generation: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const flushDeferredConfig = (nextConfig: ResolvedTimelineConfig, generation: number, delayMs: number) => {
    // Guard is load-bearing: it narrows `Timeout | null` away (this lib mix
    // rejects null) and resets the ref so a stale timer can't double-fire.
    if (deferTimerRef.current) {
      clearTimeout(deferTimerRef.current);
      deferTimerRef.current = null;
    }
    if (delayMs <= 0) {
      if (generation === configGenerationRef.current) {
        setDeferredConfigState({ config: nextConfig, generation });
      }
      return;
    }
    deferTimerRef.current = setTimeout(() => {
      deferTimerRef.current = null;
      if (generation === configGenerationRef.current) {
        setDeferredConfigState({ config: nextConfig, generation });
      }
    }, delayMs);
  };

  useEffect(() => {
    if (isPlaying) {
      latestConfigRef.current = { config, generation: configGenerationRef.current };
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const nextConfig = latestConfigRef.current;
          latestConfigRef.current = null;
          if (nextConfig && nextConfig.generation === configGenerationRef.current) {
            setDeferredConfigState(nextConfig);
          }
        });
      }
    } else {
      // Paused: flush any in-flight live update immediately, then debounce idle edits.
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const currentConfig = { config, generation: configGenerationRef.current };
      const queuedConfig = latestConfigRef.current;
      // A pause and a newer prop update can be committed together. Never let
      // an older playing mailbox overwrite the current semantic generation;
      // the generation gate would otherwise leave later seeks waiting forever.
      const nextConfig = queuedConfig && queuedConfig.generation >= currentConfig.generation
        ? queuedConfig
        : currentConfig;
      const delayMs = queuedConfig && nextConfig === queuedConfig ? 0 : 150;
      latestConfigRef.current = null;
      flushDeferredConfig(nextConfig.config, nextConfig.generation, delayMs);
    }
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (deferTimerRef.current) {
        clearTimeout(deferTimerRef.current);
        deferTimerRef.current = null;
      }
    };
  }, [config, isPlaying]);

  const inputProps = useMemo(() => ({
    config: deferredConfig,
    astridElementHost,
    previewMediaFailurePolicy: previewMediaFailure,
  }), [astridElementHost, deferredConfig, previewMediaFailure]);
  const metadata = useMemo(() => {
    const fps = deferredConfig.output.fps;
    const { width, height } = parseResolution(deferredConfig.output.resolution);

    return {
      fps,
      durationInFrames: Math.max(
        1,
        ...deferredConfig.clips.map((clip) => secondsToFrames(clip.at, fps) + getClipDurationInFrames(clip, fps)),
      ),
      compositionWidth: Math.max(1, width),
      compositionHeight: Math.max(1, height),
    };
  }, [deferredConfig.clips, deferredConfig.output.fps, deferredConfig.output.resolution]);
  const metadataRef = useRef(metadata);
  metadataRef.current = metadata;
  const appliedConfigGenerationRef = useRef(deferredConfigState.generation);
  appliedConfigGenerationRef.current = deferredConfigState.generation;

  useEffect(() => {
    markEventsEffect();
    const player = playerRef.current;
    if (!player) {
      return;
    }

    const onFrameUpdate = (event: { detail: { frame: number } }) => {
      const time = event.detail.frame / metadata.fps;
      onTimeUpdate(time);
      if (previewMediaFailure?.enabled) {
        const activeVideoClipIds = deferredConfig.clips
          .filter((clip) => {
            if (!clip.assetEntry?.type?.startsWith('video')) return false;
            const start = secondsToFrames(clip.at, metadata.fps);
            const end = start + getClipDurationInFrames(clip, metadata.fps);
            return event.detail.frame >= start && event.detail.frame < end;
          })
          .map((clip) => clip.id);
        previewMediaFailure.syncActiveClips(activeVideoClipIds);
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    player.addEventListener('frameupdate', onFrameUpdate);
    player.addEventListener('play', onPlay);
    player.addEventListener('pause', onPause);

    return () => {
      player.removeEventListener('frameupdate', onFrameUpdate);
      player.removeEventListener('play', onPlay);
      player.removeEventListener('pause', onPause);
    };
  }, [deferredConfig.clips, markEventsEffect, metadata.fps, onTimeUpdate, previewMediaFailure]);

  const flushPendingSeekRef = useRef<() => void>(() => undefined);
  const dispatchSeek = useCallback((pendingSeek: PendingSeek) => {
    if (pendingSeek.configGeneration !== configGenerationRef.current) {
      return;
    }
    if (pendingSeek.configGeneration !== appliedConfigGenerationRef.current) {
      return;
    }

    const player = playerRef.current;
    if (!player) {
      return;
    }

    const currentMetadata = metadataRef.current;
    const requestedFrame = Math.round(pendingSeek.time * currentMetadata.fps);
    const frame = Math.min(Math.max(0, requestedFrame), Math.max(0, currentMetadata.durationInFrames - 1));
    activeSeekRef.current = pendingSeek;
    const lastFrame = currentMetadata.durationInFrames - 1;
    const wasPlaying = player.isPlaying() && playbackIntentRef.current !== 'paused';
    if (wasPlaying) {
      player.pause();
    }
    // Narrow, opt-in browser evidence seam: the focused scrub spec installs
    // this observer before the editor mounts. Production has no observer and
    // the authoritative Player.seekTo path remains unchanged.
    if (typeof window !== 'undefined') {
      const observer = (window as Window & { __REIGH_TEST_PLAYER_SEEK__?: TestPlayerSeekObserver }).__REIGH_TEST_PLAYER_SEEK__;
      observer?.onDispatch?.({ time: pendingSeek.time, frame, configGeneration: pendingSeek.configGeneration });
    }
    player.seekTo(frame);
    if (wasPlaying && frame < lastFrame && playbackIntentRef.current !== 'paused') {
      if (typeof window !== 'undefined') {
        const observer = (window as Window & { __REIGH_TEST_PLAYER_SEEK__?: TestPlayerSeekObserver }).__REIGH_TEST_PLAYER_SEEK__;
        observer?.onAutoResume?.();
      }
      player.play();
    }

    if (seekFlushRafRef.current === null) {
      seekFlushRafRef.current = requestAnimationFrame(() => {
        seekFlushRafRef.current = null;
        activeSeekRef.current = null;
        flushPendingSeekRef.current();
      });
    }
  }, []);

  const flushPendingSeek = useCallback(() => {
    if (activeSeekRef.current !== null) {
      return;
    }
    const pendingSeek = pendingSeekRef.current;
    if (pendingSeek === null) {
      return;
    }
    if (pendingSeek.configGeneration !== configGenerationRef.current) {
      pendingSeekRef.current = null;
      return;
    }
    if (pendingSeek.configGeneration !== appliedConfigGenerationRef.current) {
      return;
    }
    pendingSeekRef.current = null;
    dispatchSeek(pendingSeek);
  }, [dispatchSeek]);
  flushPendingSeekRef.current = flushPendingSeek;

  useEffect(() => {
    // A seek requested during the deferred-config window stays semantic until
    // Player has rendered the matching generation, then enters the normal
    // one-active/one-latest command window.
    flushPendingSeek();
  }, [deferredConfig, deferredConfigState.generation, flushPendingSeek]);

  const requestSeek = useCallback((time: number) => {
    // Player.seekTo is the only authoritative editor seek path. The one-frame
    // command window keeps one active command plus one replaceable latest
    // target; it does not attempt to predict browser decode completion.
    const configGeneration = configGenerationRef.current;
    const pendingSeek = { time, configGeneration };
    if (activeSeekRef.current !== null) {
      if (
        activeSeekRef.current.configGeneration === configGeneration
        && activeSeekRef.current.time === time
      ) {
        pendingSeekRef.current = null;
      } else {
        pendingSeekRef.current = pendingSeek;
      }
      return;
    }

    pendingSeekRef.current = pendingSeek;
    flushPendingSeek();
  }, [flushPendingSeek]);

  // Live edits can shrink the timeline mid-playback; park the playhead on the
  // last frame instead of running past (or looping past) the new end. This
  // correction uses the same authoritative seek dispatcher as editor intent.
  useEffect(() => {
    const player = playerRef.current;
    if (player && player.getCurrentFrame() >= metadata.durationInFrames) {
      requestSeek(Math.max(0, metadata.durationInFrames - 1) / metadata.fps);
    }
  }, [metadata.durationInFrames, metadata.fps, requestSeek]);

  const seek = useCallback((time: number) => {
    requestSeek(time);
  }, [requestSeek]);

  const play = useCallback(() => {
    playbackIntentRef.current = 'playing';
    playerRef.current?.play();
  }, []);

  const pause = useCallback(() => {
    playbackIntentRef.current = 'paused';
    playerRef.current?.pause();
  }, []);

  const togglePlayPause = useCallback(() => {
    const player = playerRef.current;
    const currentlyPlaying = player?.isPlaying() ?? isPlaying;
    playbackIntentRef.current = currentlyPlaying ? 'paused' : 'playing';
    player?.toggle();
  }, [isPlaying]);

  useEffect(() => () => {
    if (seekFlushRafRef.current !== null) {
      cancelAnimationFrame(seekFlushRafRef.current);
      seekFlushRafRef.current = null;
    }
  }, []);

  useImperativeHandle(ref, () => ({
    seek,
    play,
    pause,
    togglePlayPause,
    get isPlaying() {
      return playerRef.current?.isPlaying() ?? isPlaying;
    },
  }), [isPlaying, pause, play, seek, togglePlayPause]);

  const failedMedia = previewMediaFailure?.enabled ? previewMediaFailure.failure : null;
  const failedMediaRetryToken = failedMedia
    ? previewMediaFailure?.retryTokenFor(failedMedia.clipId, failedMedia.source) ?? 0
    : 0;
  useEffect(() => {
    if (!previewMediaFailure?.enabled || !failedMedia || failedMediaRetryToken === 0) return;
    const expectedPath = new URL(failedMedia.source, window.location.href).pathname;
    const checkNativeFrame = () => {
      const nativeVideo = playerContainerRef.current?.querySelector('video');
      if (nativeVideo && nativeVideo.error === null && nativeVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        try {
          if (new URL(nativeVideo.currentSrc || nativeVideo.src, window.location.href).pathname === expectedPath) {
            previewMediaFailure.markFrameReady(failedMedia.clipId, failedMedia.source, failedMediaRetryToken);
          }
        } catch {
          // Wait for the retried source to become an ordinary local URL.
        }
      }
    };
    checkNativeFrame();
    const interval = window.setInterval(checkNativeFrame, 160);
    return () => {
      window.clearInterval(interval);
    };
  }, [failedMedia, failedMediaRetryToken, playerContainerRef, previewMediaFailure]);

  useEffect(() => {
    if (!previewMediaFailure?.enabled || !failedMedia || !previewMediaFailure.retryPending || failedMediaRetryToken === 0) return;
    const timeout = window.setTimeout(() => {
      previewMediaFailure.markRetryFailed(failedMedia.clipId, failedMedia.source, failedMediaRetryToken);
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [failedMedia, failedMediaRetryToken, previewMediaFailure]);

  useEffect(() => {
    const container = playerContainerRef.current;
    if (!container) return undefined;

    let readyFrame: number | null = null;
    const markPreviewFrameReady = () => {
      // A canvas can exist while its media is still fetching (or has failed).
      // Wait for the decoder callback and one paint before exposing the preview.
      container.dataset.astridPreviewFrameReady = 'true';
    };
    const inspectDecodedFrame = () => {
      if (readyFrame === null && container.querySelector('[data-preview-decoded-frame="true"]')) {
        readyFrame = requestAnimationFrame(markPreviewFrameReady);
      }
    };
    const observer = new MutationObserver(inspectDecodedFrame);
    observer.observe(container, {childList: true, subtree: true, attributes: true, attributeFilter: ['data-preview-decoded-frame']});
    inspectDecodedFrame();
    return () => {
      observer.disconnect();
      if (readyFrame !== null) cancelAnimationFrame(readyFrame);
      delete container.dataset.astridPreviewFrameReady;
    };
  }, [playerContainerRef]);

  const transport = (
    <div
      className="astrid-preview-transport pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-2 px-3 py-3"
      style={{ ...VIDEO_EDITOR_THEME_VARS, backgroundImage: 'linear-gradient(to top, var(--video-editor-stage-gradient-start), transparent)' }}
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn(TRANSPORT_BUTTON_CLASS, touchChrome ? 'h-11 w-11' : 'h-8 w-8')}
        onClick={() => requestSeek(0)}
        title="Jump to beginning"
        aria-label="Jump to beginning"
      >
        <SkipBack className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn(TRANSPORT_BUTTON_CLASS, touchChrome ? 'h-12 w-12' : 'h-10 w-10')}
        onClick={togglePlayPause}
        title={isPlaying ? 'Pause' : 'Play'}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
      </Button>
      {!compact && (
        <div className="pointer-events-none rounded-full bg-background/70 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {config.output.resolution}
        </div>
      )}
    </div>
  );

  const mediaFailureNotice = previewMediaFailure?.enabled && previewMediaFailure.failure ? (
    <div className="astrid-preview-media-failure" role="status" aria-live="polite" aria-atomic="true" data-testid="preview-media-failure" data-retry-pending={previewMediaFailure.retryPending}>
      <strong>Preview unavailable</strong>
      <p>This clip couldn’t load. Showing its poster.</p>
      <button
        type="button"
        onClick={() => {
          playerRef.current?.pause();
          previewMediaFailure.retry();
        }}
        disabled={previewMediaFailure.retryPending}
      >
        {previewMediaFailure.retryPending ? 'Retrying preview…' : 'Retry preview'}
      </button>
    </div>
  ) : null;

  const previewControls = <>{transport}{mediaFailureNotice}</>;

  return (
    <div
      ref={playerContainerRef}
      className="relative flex h-full min-h-[220px] w-full items-center justify-center overflow-hidden rounded-xl bg-background"
      style={VIDEO_EDITOR_THEME_VARS}
    >
      <Player
        ref={playerRef}
        component={TimelineRenderer}
        inputProps={inputProps}
        durationInFrames={metadata.durationInFrames}
        fps={metadata.fps}
        compositionWidth={metadata.compositionWidth}
        compositionHeight={metadata.compositionHeight}
        numberOfSharedAudioTags={PREVIEW_SHARED_AUDIO_TAGS}
        initialFrame={Math.min(Math.max(0, Math.round(initialTime * metadata.fps)), Math.max(0, metadata.durationInFrames - 1))}
        controls={false}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        spaceKeyToPlayOrPause={false}
        showVolumeControls={false}
        acknowledgeRemotionLicense
        bufferStateDelayInMilliseconds={1000}
        renderLoading={() => (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--video-editor-stage-bg)',
              color: 'var(--video-editor-stage-fg-subtle)',
              fontSize: 13,
              fontFamily: 'monospace',
            }}
          >
            Loading preview…
          </div>
        )}
        style={{ width: '100%', height: '100%' }}
      />
      {previewMediaFailure?.enabled && previewMediaFailure.failure ? (
        <div className="astrid-preview-media-failure-poster" aria-hidden="true" data-testid="preview-media-failure-poster">
          {previewMediaFailure.failure.posterUrl && (
            <img src={previewMediaFailure.failure.posterUrl} alt="" />
          )}
        </div>
      ) : null}
      {transportOutlet ? createPortal(previewControls, transportOutlet) : previewControls}
    </div>
  );
});

RemotionPreviewComponent.displayName = 'RemotionPreview';

export const RemotionPreview = memo(RemotionPreviewComponent);
