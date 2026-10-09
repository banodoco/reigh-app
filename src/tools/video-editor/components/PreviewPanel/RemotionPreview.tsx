import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { forwardRef, memo, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pause, Play, SkipBack } from 'lucide-react';
import { Player, type PlayerRef } from '@remotion/player';
import { Button } from '@/shared/components/ui/button.tsx';
import { cn } from '@/shared/components/ui/contracts/cn.ts';
import { projectOutputTimelineConfig, trackRole } from '@/tools/video-editor/data/timelineOutputProjection.ts';
import { TimelineRenderer } from '@/tools/video-editor/compositions/TimelineRenderer.tsx';
import { useEffectDiagnostic, useRenderDiagnostic } from '@/tools/video-editor/hooks/usePerfDiagnostics.ts';
import { getClipDurationInFrames, parseResolution, secondsToFrames } from '@/tools/video-editor/lib/config-utils.ts';
import { VIDEO_EDITOR_THEME_VARS } from '@/tools/video-editor/lib/themeTokens.ts';
import type { ResolvedTimelineConfig } from '@/tools/video-editor/types/index.ts';
import { VideoEditorRuntimeContext } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';

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
  frame: number;
  configGeneration: number;
  time?: number;
}

interface RemotionPreviewProps {
  config: ResolvedTimelineConfig;
  onTimeUpdate: (time: number) => void;
  playerContainerRef: RefObject<HTMLDivElement>;
  compact?: boolean;
  /** Phone/tablet chrome: transport controls grow to touch-sized hit targets. */
  touchChrome?: boolean;
  initialTime?: number;
  /** @deprecated Compatibility only; ignored. Use initialTime or PreviewHandle.seek. */
  currentTime?: number;
  /** Optional host-owned outlet for transport controls (e.g. public shells). */
  transportOutlet?: HTMLElement | null;
}

const RemotionPreviewComponent = forwardRef<PreviewHandle, RemotionPreviewProps>(function RemotionPreview(
  { config, onTimeUpdate, playerContainerRef, compact = false, touchChrome = false, initialTime = 0, transportOutlet = null },
  ref,
) {
  const runtime = useContext(VideoEditorRuntimeContext);
  const playerRef = useRef<PlayerRef>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackIntentRef = useRef<'playing' | 'paused'>('paused');
  const activeSeekFrameRef = useRef<number | null>(null);
  const pendingSeekRef = useRef<PendingSeek | null>(null);
  const seekFlushRafRef = useRef<number | null>(null);
  const appliedConfigGenerationRef = useRef(0);
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
  const [deferredConfig, setDeferredConfig] = useState(config);
  // Incremented when the debounce mailbox applies a config even if React
  // keeps the same object identity (A → B → A). This lets queued seeks use
  // the newest semantic generation without forcing a Player remount.
  const [deferredConfigEpoch, setDeferredConfigEpoch] = useState(0);
  const deferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Live-edit mailbox: while playing, timeline edits must reach the Player on
  // the next animation frame (live media updates, no pause+restart), but no
  // more than once per frame so rapid commits can't cause renderer jank.
  const latestConfigRef = useRef<ResolvedTimelineConfig | null>(null);
  const rafRef = useRef<number | null>(null);
  const flushDeferredConfig = (nextConfig: ResolvedTimelineConfig, delayMs: number) => {
    // Guard is load-bearing: it narrows `Timeout | null` away (this lib mix
    // rejects null) and resets the ref so a stale timer can't double-fire.
    if (deferTimerRef.current) {
      clearTimeout(deferTimerRef.current);
      deferTimerRef.current = null;
    }
    if (delayMs <= 0) {
      setDeferredConfig(nextConfig);
      setDeferredConfigEpoch((epoch) => epoch + 1);
      return;
    }
    deferTimerRef.current = setTimeout(() => {
      setDeferredConfig(nextConfig);
      setDeferredConfigEpoch((epoch) => epoch + 1);
    }, delayMs);
  };

  useEffect(() => {
    if (isPlaying) {
      latestConfigRef.current = config;
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const nextConfig = latestConfigRef.current;
          latestConfigRef.current = null;
          if (nextConfig) {
            setDeferredConfig(nextConfig);
          }
        });
      }
    } else {
      // Paused: flush any in-flight live update immediately, then debounce idle edits.
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // The mailbox only selects flush timing; current props own the newest config.
      const nextConfig = config;
      const delayMs = latestConfigRef.current ? 0 : 150;
      latestConfigRef.current = null;
      flushDeferredConfig(nextConfig, delayMs);
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

  const outputProjection = useMemo(() => projectOutputTimelineConfig(deferredConfig), [deferredConfig]);
  // Preserve the ordinary preview identity/mailbox when nothing is excluded.
  const outputConfig = outputProjection.excludedClipIds.length ? outputProjection.config : deferredConfig;
  const hasSourceTracks = deferredConfig.tracks.some((track) => trackRole(track) === 'source');
  const sourceOnly = hasSourceTracks && !outputProjection.hasOutputContent;
  const inputProps = useMemo(() => ({
    config: outputConfig,
    ...(runtime?.astridElementHost ? { astridElementHost: runtime.astridElementHost } : {}),
  }), [outputConfig, runtime?.astridElementHost]);
  const metadata = useMemo(() => {
    const fps = outputConfig.output.fps;
    const { width, height } = parseResolution(outputConfig.output.resolution);

    return {
      fps,
      durationInFrames: Math.max(
        1,
        ...outputConfig.clips.map((clip) => secondsToFrames(clip.at, fps) + getClipDurationInFrames(clip, fps)),
      ),
      compositionWidth: Math.max(1, width),
      compositionHeight: Math.max(1, height),
    };
  }, [outputConfig.clips, outputConfig.output.fps, outputConfig.output.resolution]);
  const metadataRef = useRef(metadata);
  metadataRef.current = metadata;

  useEffect(() => {
    markEventsEffect();
    const player = playerRef.current;
    if (!player) {
      return;
    }

    const onFrameUpdate = (event: { detail: { frame: number } }) => {
      onTimeUpdate(event.detail.frame / metadata.fps);
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
  }, [markEventsEffect, metadata.fps, onTimeUpdate]);

  const requestSeek = useCallback((targetFrame: number) => {
    // Player.seekTo is the only authoritative editor seek path. The one-frame
    // command window keeps one active command plus one replaceable latest
    // target; it does not attempt to predict browser decode completion.
    const configGeneration = configGenerationRef.current;
    // A prop update is debounced before it reaches Remotion. Keep imperative
    // seeks queued until the Player is rendering that same config generation;
    // otherwise a seek expressed in the new fps/extent is sent to stale media.
    if (configGeneration !== appliedConfigGenerationRef.current) {
      pendingSeekRef.current = { frame: targetFrame, configGeneration };
      return;
    }
    if (activeSeekFrameRef.current !== null) {
      if (activeSeekFrameRef.current === targetFrame) {
        pendingSeekRef.current = null;
      } else {
        pendingSeekRef.current = { frame: targetFrame, configGeneration };
      }
      return;
    }

    const dispatchSeek = ({ frame: requestedFrame, configGeneration: requestedGeneration }: PendingSeek) => {
      if (requestedGeneration !== configGenerationRef.current) {
        return;
      }
      const player = playerRef.current;
      if (!player) {
        return;
      }

      const currentMetadata = metadataRef.current;
      const frame = Math.min(Math.max(0, requestedFrame), Math.max(0, currentMetadata.durationInFrames - 1));
      activeSeekFrameRef.current = frame;
      const lastFrame = currentMetadata.durationInFrames - 1;
      const wasPlaying = player.isPlaying() && playbackIntentRef.current !== 'paused';
      if (wasPlaying) {
        player.pause();
      }
      player.seekTo(frame);
      if (wasPlaying && frame < lastFrame && playbackIntentRef.current !== 'paused') {
        player.play();
      }

      if (seekFlushRafRef.current === null) {
        seekFlushRafRef.current = requestAnimationFrame(() => {
          seekFlushRafRef.current = null;
          activeSeekFrameRef.current = null;
          const pendingSeek = pendingSeekRef.current;
          pendingSeekRef.current = null;
          if (pendingSeek !== null) {
            dispatchSeek(pendingSeek);
          }
        });
      }
    };

    dispatchSeek({ frame: targetFrame, configGeneration });
  }, []);

  useEffect(() => {
    appliedConfigGenerationRef.current = configGenerationRef.current;
    const pendingSeek = pendingSeekRef.current;
    if (pendingSeek?.configGeneration === appliedConfigGenerationRef.current) {
      pendingSeekRef.current = null;
      const frame = pendingSeek.time === undefined
        ? pendingSeek.frame
        : Math.max(0, Math.round(pendingSeek.time * metadataRef.current.fps));
      requestSeek(frame);
    }
  }, [deferredConfig, deferredConfigEpoch, requestSeek]);

  // Live edits can shrink the timeline mid-playback; park the playhead on the
  // last frame instead of running past (or looping past) the new end. This
  // correction uses the same authoritative seek dispatcher as editor intent.
  useEffect(() => {
    const player = playerRef.current;
    if (player && player.getCurrentFrame() >= metadata.durationInFrames) {
      requestSeek(Math.max(0, metadata.durationInFrames - 1));
    }
  }, [isPlaying, metadata.durationInFrames, requestSeek]);

  const seek = useCallback((time: number) => {
    const currentMetadata = metadataRef.current;
    const nextFrame = Math.max(0, Math.round(time * currentMetadata.fps));
    if (configGenerationRef.current !== appliedConfigGenerationRef.current) {
      pendingSeekRef.current = {
        frame: nextFrame,
        time,
        configGeneration: configGenerationRef.current,
      };
      return;
    }
    requestSeek(Math.min(nextFrame, Math.max(0, currentMetadata.durationInFrames - 1)));
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

  useImperativeHandle(ref, () => ({
    seek,
    play,
    pause,
    togglePlayPause,
    get isPlaying() {
      return playerRef.current?.isPlaying() ?? isPlaying;
    },
  }), [isPlaying, pause, play, seek, togglePlayPause]);

  const transportControls = (
    <div
      className="astrid-preview-transport pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-2 px-3 py-3"
      style={{ backgroundImage: 'linear-gradient(to top, var(--video-editor-stage-gradient-start), transparent)' }}
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn(TRANSPORT_BUTTON_CLASS, touchChrome ? 'h-11 w-11' : 'h-8 w-8')}
        disabled={sourceOnly}
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
        disabled={sourceOnly}
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

  return (
    <div
      ref={playerContainerRef}
      className="relative flex h-full min-h-[220px] w-full items-center justify-center overflow-hidden rounded-xl bg-background"
      style={VIDEO_EDITOR_THEME_VARS}
    >
      {hasSourceTracks && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded bg-background/90 px-2 py-1 text-xs text-foreground">
          Output · source tracks excluded
        </div>
      )}
      {sourceOnly && (
        <div role="status" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6 text-center text-sm text-foreground">
          No output content. Source material is available in the timeline.
        </div>
      )}
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
      {transportOutlet ? createPortal(transportControls, transportOutlet) : transportControls}
    </div>
  );
});

RemotionPreviewComponent.displayName = 'RemotionPreview';

export const RemotionPreview = memo(RemotionPreviewComponent);
