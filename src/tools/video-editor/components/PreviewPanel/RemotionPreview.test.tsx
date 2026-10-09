// @vitest-environment jsdom
import React, { createRef } from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { RemotionPreview, type PreviewHandle } from '@/tools/video-editor/components/PreviewPanel/RemotionPreview';
import type { ResolvedTimelineConfig } from '@/tools/video-editor/types';
import { VideoEditorRuntimeProvider, type VideoEditorRuntimeContextValue } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import type { AstridElementHost } from '@/tools/video-editor/runtime/astrid-element-host.ts';

vi.mock('@/tools/video-editor/compositions/TimelineRenderer', () => ({
  TimelineRenderer: () => null,
}));

const playerListeners = new Map<string, Set<(...args: any[]) => void>>();
const playerPropsHistory: Array<{ config: ResolvedTimelineConfig; astridElementHost?: AstridElementHost; numberOfSharedAudioTags?: number; initialFrame?: number; compositionWidth?: number; compositionHeight?: number }> = [];
const playerHandles: Array<{
  seekTo: ReturnType<typeof vi.fn>;
  getCurrentFrame: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  isPlaying: ReturnType<typeof vi.fn>;
}> = [];

vi.mock('@remotion/player', async () => {
  const React = await import('react');

  return {
    Player: React.forwardRef(function MockPlayer(
      props: { inputProps: { config: ResolvedTimelineConfig; astridElementHost?: AstridElementHost }; numberOfSharedAudioTags?: number; initialFrame?: number; compositionWidth?: number; compositionHeight?: number },
      ref: React.Ref<unknown>,
    ) {
      playerPropsHistory.push({
        config: props.inputProps.config,
        astridElementHost: props.inputProps.astridElementHost,
        numberOfSharedAudioTags: props.numberOfSharedAudioTags,
        initialFrame: props.initialFrame,
        compositionWidth: props.compositionWidth,
        compositionHeight: props.compositionHeight,
      });
      React.useImperativeHandle(ref, () => {
        const seekTo = vi.fn();
        const getCurrentFrame = vi.fn(() => 0);
        const play = vi.fn();
        const isPlaying = vi.fn(() => false);
        playerHandles.push({ seekTo, getCurrentFrame, play, isPlaying });
        return {
          addEventListener: (name: string, listener: (...args: unknown[]) => void) => {
            if (!playerListeners.has(name)) {
              playerListeners.set(name, new Set());
            }
            playerListeners.get(name)!.add(listener);
          },
          removeEventListener: (name: string, listener: (...args: unknown[]) => void) => {
            playerListeners.get(name)?.delete(listener);
          },
          seekTo,
          getCurrentFrame,
          play,
          pause: vi.fn(),
          toggle: vi.fn(),
          isPlaying,
        };
      }, []);

      return <div data-testid="mock-player" />;
    }),
  };
});

function emitPlayerEvent(name: string, detail: unknown = undefined) {
  const listeners = playerListeners.get(name);
  if (!listeners) {
    return;
  }

  for (const listener of listeners) {
    listener({ detail });
  }
}

function makeConfig(label: string, hold = 1, fps = 30): ResolvedTimelineConfig {
  return {
    output: {
      fps,
      resolution: '1280x720',
      file: `${label}.mp4`,
    },
    tracks: [{ id: 'V1', kind: 'visual', label: 'V1' }],
    clips: [{
      id: `clip-${label}`,
      at: 0,
      track: 'V1',
      clipType: 'hold',
      hold,
    }],
    registry: {},
  };
}

function makeMediaConfig(
  label: string,
  { from = 0, to = 3, speed = 1, fps = 30 }: { from?: number; to?: number; speed?: number; fps?: number } = {},
): ResolvedTimelineConfig {
  return {
    output: {
      fps,
      resolution: '1280x720',
      file: `${label}.mp4`,
    },
    tracks: [{ id: 'V1', kind: 'visual', label: 'V1' }],
    clips: [{
      id: `clip-${label}`,
      at: 0,
      track: 'V1',
      clipType: 'media',
      asset: `asset-${label}`,
      assetEntry: {
        src: `/${label}.mp4`,
        type: 'video/mp4',
      },
      from,
      to,
      speed,
    }],
    registry: {},
  };
}

function makeAudioConfig(audioClipCount: number): ResolvedTimelineConfig {
  return {
    output: {
      fps: 30,
      resolution: '1280x720',
      file: 'audio.mp4',
    },
    tracks: [{ id: 'VO', kind: 'audio', label: 'VO' }],
    clips: Array.from({ length: audioClipCount }, (_, index) => ({
      id: `audio-${index}`,
      at: index,
      track: 'VO',
      clipType: 'media' as const,
      asset: `asset-${index}`,
      assetEntry: {
        src: `/audio-${index}.mp3`,
        type: 'audio/mpeg' as const,
      },
      hold: 1,
    })),
    registry: {},
  };
}

describe('RemotionPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    playerListeners.clear();
    playerPropsHistory.length = 0;
    playerHandles.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts a genuine attachment remount paused at the latest authoritative playhead and dimensions', () => {
    const previewRef = createRef<PreviewHandle>();
    const playerContainerRef = createRef<HTMLDivElement>();
    const onTimeUpdate = vi.fn();
    const { rerender } = render(<RemotionPreview
      key="attachment-1"
      ref={previewRef}
      config={makeConfig('before-slot-move', 4)}
      initialTime={1.25}
      onTimeUpdate={onTimeUpdate}
      playerContainerRef={playerContainerRef}
    />);
    expect(playerPropsHistory.at(-1)?.initialFrame).toBe(38);
    act(() => previewRef.current?.play());
    expect(playerHandles[0]!.play).toHaveBeenCalledTimes(1);

    const latest = makeConfig('latest-slot', 4, 24);
    latest.output.resolution = '1920x1080';
    rerender(<RemotionPreview
      key="attachment-2"
      ref={previewRef}
      config={latest}
      initialTime={2.5}
      onTimeUpdate={onTimeUpdate}
      playerContainerRef={playerContainerRef}
    />);
    expect(playerHandles).toHaveLength(2);
    expect(playerPropsHistory.at(-1)).toMatchObject({
      config: latest, initialFrame: 60, compositionWidth: 1920, compositionHeight: 1080,
    });
    expect(playerHandles[1]!.play).not.toHaveBeenCalled();
    expect(previewRef.current?.isPlaying).toBe(false);
  });

  it('forwards the provider-owned Astrid element host to the actual Player', () => {
    const host: AstridElementHost = {
      descriptors: [],
      sequenceRegistry: {},
      resolveComponent: () => undefined,
      resolveSequenceClipEntry: () => undefined,
      describeClipCapability: () => undefined,
    };
    render(
      <VideoEditorRuntimeProvider value={{astridElementHost: host} as VideoEditorRuntimeContextValue}>
        <RemotionPreview
          config={makeConfig('public-host')}
          onTimeUpdate={vi.fn()}
          playerContainerRef={createRef<HTMLDivElement>()}
        />
      </VideoEditorRuntimeProvider>,
    );
    expect(playerPropsHistory.at(-1)?.astridElementHost).toBe(host);
  });

  it('renders controls into an optional public outlet without remounting the Player', () => {
    const outlet = document.createElement('div');
    document.body.append(outlet);
    const config = makeConfig('transport-outlet');
    const props = {
      config,
      onTimeUpdate: vi.fn(),
      playerContainerRef: createRef<HTMLDivElement>(),
      transportOutlet: outlet,
      touchChrome: true,
    };
    const {container, rerender, unmount} = render(<RemotionPreview {...props} />);
    const player = container.querySelector('[data-testid="mock-player"]');
    const play = outlet.querySelector<HTMLButtonElement>('button[aria-label="Play"]');

    expect(player).not.toBeNull();
    expect(play).not.toBeNull();
    expect(play).toHaveClass('h-12', 'w-12');
    expect(container.querySelector('.astrid-preview-transport')).toBeNull();

    rerender(<RemotionPreview {...props} />);

    expect(container.querySelector('[data-testid="mock-player"]')).toBe(player);
    expect(outlet.querySelector('button[aria-label="Play"]')).not.toBeNull();
    unmount();
    outlet.remove();
  });

  it('applies config updates live while playing', () => {
    const onTimeUpdate = vi.fn();
    const playerContainerRef = createRef<HTMLDivElement>();
    const initialConfig = makeConfig('initial');
    const nextConfig = makeConfig('next');

    const { rerender } = render(
      <RemotionPreview
        config={initialConfig}
        onTimeUpdate={onTimeUpdate}
        playerContainerRef={playerContainerRef}
      />,
    );

    act(() => {
      vi.runAllTimers();
    });

    expect(playerPropsHistory.at(-1)?.config).toBe(initialConfig);

    act(() => {
      emitPlayerEvent('play');
    });

    rerender(
      <RemotionPreview
        config={nextConfig}
        onTimeUpdate={onTimeUpdate}
        playerContainerRef={playerContainerRef}
      />,
    );

    act(() => {
      // One animation frame (16ms) — a 150ms debounce would NOT have flushed yet,
      // so this pins the rAF-mailbox delivery, not just "eventually applies".
      vi.advanceTimersByTime(16);
    });

    // The edit reaches the Player on the next animation frame — no pause needed.
    expect(playerPropsHistory.at(-1)?.config).toBe(nextConfig);
  });

  it('does not apply an older playing mailbox over a newer config when pausing', () => {
    const previewRef = createRef<PreviewHandle>();
    const playerContainerRef = createRef<HTMLDivElement>();
    const configA = makeConfig('mailbox-a', 2, 30);
    const configB = makeConfig('mailbox-b', 2, 60);
    const configC = makeConfig('mailbox-c', 2, 90);

    const { rerender } = render(
      <RemotionPreview
        ref={previewRef}
        config={configA}
        onTimeUpdate={vi.fn()}
        playerContainerRef={playerContainerRef}
      />,
    );

    const player = playerHandles.at(-1)!;
    act(() => {
      vi.runAllTimers();
      emitPlayerEvent('play');
    });
    rerender(
      <RemotionPreview
        ref={previewRef}
        config={configB}
        onTimeUpdate={vi.fn()}
        playerContainerRef={playerContainerRef}
      />,
    );

    // Pause and config C arrive before B's animation-frame mailbox flushes.
    act(() => {
      emitPlayerEvent('pause');
      rerender(
        <RemotionPreview
          ref={previewRef}
          config={configC}
          onTimeUpdate={vi.fn()}
          playerContainerRef={playerContainerRef}
        />,
      );
    });
    act(() => {
      vi.runAllTimers();
      previewRef.current?.seek(1);
    });

    expect(playerPropsHistory.at(-1)?.config).toBe(configC);
    expect(player.seekTo).toHaveBeenLastCalledWith(90);
  });

  it('disables Remotion shared audio pooling for long canonical timelines', () => {
    render(
      <RemotionPreview
        config={makeAudioConfig(16)}
        onTimeUpdate={vi.fn()}
        playerContainerRef={createRef<HTMLDivElement>()}
      />,
    );

    expect(playerPropsHistory.at(-1)?.numberOfSharedAudioTags).toBe(0);
  });

  it('coalesces rapid config updates while playing into one player update per frame', () => {
    const onTimeUpdate = vi.fn();
    const playerContainerRef = createRef<HTMLDivElement>();
    const configA = makeConfig('burst-a');
    const configB = makeConfig('burst-b');
    const configC = makeConfig('burst-c');

    const { rerender } = render(
      <RemotionPreview
        config={configA}
        onTimeUpdate={onTimeUpdate}
        playerContainerRef={playerContainerRef}
      />,
    );

    act(() => {
      emitPlayerEvent('play');
    });

    rerender(
      <RemotionPreview
        config={configB}
        onTimeUpdate={onTimeUpdate}
        playerContainerRef={playerContainerRef}
      />,
    );
    rerender(
      <RemotionPreview
        config={configC}
        onTimeUpdate={onTimeUpdate}
        playerContainerRef={playerContainerRef}
      />,
    );

    const entriesBeforeFlush = playerPropsHistory.length;

    act(() => {
      // Exactly one animation frame: the burst coalesces into a single flush.
      // A debounce-style delivery would still be pending at 16ms.
      vi.advanceTimersByTime(16);
    });

    // One frame flush: only the last config of the burst reaches the Player.
    expect(playerPropsHistory.at(-1)?.config).toBe(configC);
    expect(playerPropsHistory.length).toBe(entriesBeforeFlush + 1);
  });

  it('parks the playhead on the last frame when a live edit shrinks the timeline during playback', () => {
    const onTimeUpdate = vi.fn();
    const playerContainerRef = createRef<HTMLDivElement>();
    const longConfig = makeConfig('long');
    const shortConfig = makeConfig('short', 0.5);

    const { rerender } = render(
      <RemotionPreview
        config={longConfig}
        onTimeUpdate={onTimeUpdate}
        playerContainerRef={playerContainerRef}
      />,
    );

    act(() => {
      emitPlayerEvent('play');
    });

    const player = playerHandles.at(-1)!;
    player.getCurrentFrame.mockReturnValue(20);

    rerender(
      <RemotionPreview
        config={shortConfig}
        onTimeUpdate={onTimeUpdate}
        playerContainerRef={playerContainerRef}
      />,
    );

    act(() => {
      vi.runAllTimers();
    });

    // 30-frame timeline shrinks to a 15-frame hold; the playhead at frame 20
    // parks on the new last frame instead of looping to the start.
    expect(player.seekTo).toHaveBeenLastCalledWith(14);
    expect(player.seekTo).not.toHaveBeenLastCalledWith(0);
  });

  it('converts a seek against the config generation applied to Player', () => {
    const previewRef = createRef<PreviewHandle>();
    const playerContainerRef = createRef<HTMLDivElement>();
    const initialConfig = makeConfig('generation-old', 2, 30);
    const replacementConfig = makeConfig('generation-new', 2, 60);

    const { rerender } = render(
      <RemotionPreview
        ref={previewRef}
        config={initialConfig}
        onTimeUpdate={vi.fn()}
        playerContainerRef={playerContainerRef}
      />,
    );

    const player = playerHandles.at(-1)!;
    rerender(
      <RemotionPreview
        ref={previewRef}
        config={replacementConfig}
        onTimeUpdate={vi.fn()}
        playerContainerRef={playerContainerRef}
      />,
    );

    act(() => {
      previewRef.current?.seek(1);
    });

    // The paused config update is still debounced, so no frame may be sent to
    // the old 30fps Player using the new 60fps metadata.
    expect(player.seekTo).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(playerPropsHistory.at(-1)?.config).toBe(replacementConfig);
    expect(player.seekTo).toHaveBeenLastCalledWith(60);
  });

  it('flushes a seek when a deferred config returns to the same object identity', () => {
    const previewRef = createRef<PreviewHandle>();
    const playerContainerRef = createRef<HTMLDivElement>();
    const configA = makeConfig('generation-a', 2, 30);
    const configB = makeConfig('generation-b', 2, 60);

    const { rerender } = render(
      <RemotionPreview
        ref={previewRef}
        config={configA}
        onTimeUpdate={vi.fn()}
        playerContainerRef={playerContainerRef}
      />,
    );

    const player = playerHandles.at(-1)!;
    act(() => {
      vi.runAllTimers();
    });

    // A -> B -> A can preserve the deferred config object's identity while
    // still advancing the semantic generation used by pending seeks.
    rerender(
      <RemotionPreview
        ref={previewRef}
        config={configB}
        onTimeUpdate={vi.fn()}
        playerContainerRef={playerContainerRef}
      />,
    );
    rerender(
      <RemotionPreview
        ref={previewRef}
        config={configA}
        onTimeUpdate={vi.fn()}
        playerContainerRef={playerContainerRef}
      />,
    );

    act(() => {
      previewRef.current?.seek(1);
      vi.advanceTimersByTime(150);
    });

    expect(player.seekTo).toHaveBeenLastCalledWith(30);
  });

  it('parks a paused playhead on the last frame after a duration shrink without resuming', () => {
    const previewRef = createRef<PreviewHandle>();
    const playerContainerRef = createRef<HTMLDivElement>();
    const longConfig = makeConfig('paused-shrink-long', 3);
    const shortConfig = makeConfig('paused-shrink-short', 0.5);

    const { rerender } = render(
      <RemotionPreview
        ref={previewRef}
        config={longConfig}
        onTimeUpdate={vi.fn()}
        playerContainerRef={playerContainerRef}
      />,
    );

    const player = playerHandles.at(-1)!;
    player.getCurrentFrame.mockReturnValue(20);
    player.isPlaying.mockReturnValue(false);

    rerender(
      <RemotionPreview
        ref={previewRef}
        config={shortConfig}
        onTimeUpdate={vi.fn()}
        playerContainerRef={playerContainerRef}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(player.seekTo).toHaveBeenLastCalledWith(14);
    expect(player.play).not.toHaveBeenCalled();
  });

  it('still debounces config updates while paused', () => {
    const onTimeUpdate = vi.fn();
    const playerContainerRef = createRef<HTMLDivElement>();
    const configA = makeConfig('debounce-a');
    const configB = makeConfig('debounce-b');

    const { rerender } = render(
      <RemotionPreview
        config={configA}
        onTimeUpdate={onTimeUpdate}
        playerContainerRef={playerContainerRef}
      />,
    );

    act(() => {
      vi.runAllTimers();
    });

    rerender(
      <RemotionPreview
        config={configB}
        onTimeUpdate={onTimeUpdate}
        playerContainerRef={playerContainerRef}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(149);
    });

    expect(playerPropsHistory.at(-1)?.config).toBe(configA);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(playerPropsHistory.at(-1)?.config).toBe(configB);
  });

  it('keeps the timeline current-time mirror out of the Player seek path', () => {
    const onTimeUpdate = vi.fn();
    const playerContainerRef = createRef<HTMLDivElement>();
    const config = makeConfig('seek');

    const { rerender } = render(
      <RemotionPreview
        config={config}
        initialTime={0}
        currentTime={0}
        onTimeUpdate={onTimeUpdate}
        playerContainerRef={playerContainerRef}
      />,
    );

    expect(playerHandles.at(-1)?.seekTo).not.toHaveBeenCalled();

    rerender(
      <RemotionPreview
        config={config}
        initialTime={0.5}
        currentTime={0.5}
        onTimeUpdate={onTimeUpdate}
        playerContainerRef={playerContainerRef}
      />,
    );

    expect(playerHandles.at(-1)?.seekTo).not.toHaveBeenCalled();
  });

  it('coalesces rapid imperative seeks to one active and one latest pending target', () => {
    const previewRef = createRef<PreviewHandle>();
    const onTimeUpdate = vi.fn();
    const playerContainerRef = createRef<HTMLDivElement>();

    render(
      <RemotionPreview
        ref={previewRef}
        config={makeConfig('seek-coalescing', 3)}
        onTimeUpdate={onTimeUpdate}
        playerContainerRef={playerContainerRef}
      />,
    );

    const player = playerHandles.at(-1)!;
    act(() => {
      previewRef.current?.seek(0.5);
      previewRef.current?.seek(1);
      previewRef.current?.seek(1.5);
    });

    expect(player.seekTo).toHaveBeenCalledTimes(1);
    expect(player.seekTo).toHaveBeenLastCalledWith(15);

    act(() => {
      vi.advanceTimersByTime(16);
    });

    expect(player.seekTo).toHaveBeenCalledTimes(2);
    expect(player.seekTo).toHaveBeenLastCalledWith(45);
  });

  it.each([
    ['duration shrink', makeConfig('queued-duration-long', 3), makeConfig('queued-duration-short', 0.5)],
    ['duration expansion', makeConfig('queued-duration-short', 0.5), makeConfig('queued-duration-long', 3)],
  ])('invalidates a queued seek when there is a %s', (_change, initialConfig, replacementConfig) => {
    const previewRef = createRef<PreviewHandle>();
    const playerContainerRef = createRef<HTMLDivElement>();

    const { rerender } = render(
      <RemotionPreview
        ref={previewRef}
        config={initialConfig}
        onTimeUpdate={vi.fn()}
        playerContainerRef={playerContainerRef}
      />,
    );

    const player = playerHandles.at(-1)!;
    act(() => {
      previewRef.current?.seek(0.5);
      previewRef.current?.seek(2.5);
    });

    rerender(
      <RemotionPreview
        ref={previewRef}
        config={replacementConfig}
        onTimeUpdate={vi.fn()}
        playerContainerRef={playerContainerRef}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(16);
    });

    expect(player.seekTo).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['source replacement', makeMediaConfig('queued-source-a'), makeMediaConfig('queued-source-b')],
    ['trim replacement', makeMediaConfig('queued-trim', { from: 0, to: 3 }), makeMediaConfig('queued-trim', { from: 1, to: 2 })],
    ['playback-rate replacement', makeMediaConfig('queued-rate', { speed: 1 }), makeMediaConfig('queued-rate', { speed: 2 })],
    ['config replacement', makeConfig('queued-config-a', 3), makeConfig('queued-config-b', 3, 60)],
  ])('invalidates a queued seek on %s instead of using stale metadata', (_change, initialConfig, replacementConfig) => {
    const previewRef = createRef<PreviewHandle>();
    const playerContainerRef = createRef<HTMLDivElement>();

    const { rerender } = render(
      <RemotionPreview
        ref={previewRef}
        config={initialConfig}
        onTimeUpdate={vi.fn()}
        playerContainerRef={playerContainerRef}
      />,
    );

    const player = playerHandles.at(-1)!;
    act(() => {
      previewRef.current?.seek(0.5);
      previewRef.current?.seek(2.5);
    });

    rerender(
      <RemotionPreview
        ref={previewRef}
        config={replacementConfig}
        onTimeUpdate={vi.fn()}
        playerContainerRef={playerContainerRef}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(16);
    });

    expect(player.seekTo).toHaveBeenCalledTimes(1);
  });

  it('does not resume a pending seek after an explicit pause', () => {
    const previewRef = createRef<PreviewHandle>();
    const onTimeUpdate = vi.fn();
    const playerContainerRef = createRef<HTMLDivElement>();

    render(
      <RemotionPreview
        ref={previewRef}
        config={makeConfig('seek-pause', 3)}
        onTimeUpdate={onTimeUpdate}
        playerContainerRef={playerContainerRef}
      />,
    );

    const player = playerHandles.at(-1)!;
    player.isPlaying.mockReturnValue(true);
    act(() => {
      previewRef.current?.play();
      player.play.mockClear();
      previewRef.current?.seek(0.5);
      previewRef.current?.seek(1.5);
      previewRef.current?.pause();
      vi.advanceTimersByTime(16);
    });

    expect(player.seekTo).toHaveBeenNthCalledWith(1, 15);
    expect(player.seekTo).toHaveBeenNthCalledWith(2, 45);
    expect(player.play).toHaveBeenCalledTimes(1);

    // The first seek resumes the pre-scrub playback once. The pending target
    // must remain paused after the explicit pause.
  });

  it('resumes playback when scrubbing the playhead while playing', () => {
    const previewRef = createRef<PreviewHandle>();
    const onTimeUpdate = vi.fn();
    const playerContainerRef = createRef<HTMLDivElement>();

    render(
      <RemotionPreview
        ref={previewRef}
        config={makeConfig('scrub-resume', 3)}
        onTimeUpdate={onTimeUpdate}
        playerContainerRef={playerContainerRef}
      />,
    );

    act(() => {
      previewRef.current?.play();
    });

    const player = playerHandles.at(-1)!;
    player.isPlaying.mockReturnValue(true);
    player.play.mockClear();

    act(() => {
      previewRef.current?.seek(2);
    });

    // 2s @ 30fps = frame 60 (mid-timeline, 90-frame clip), and playback
    // continues instead of parking in the new spot.
    expect(player.seekTo).toHaveBeenLastCalledWith(60);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('leaves playback parked when scrubbing to the final frame while playing', () => {
    const previewRef = createRef<PreviewHandle>();
    const onTimeUpdate = vi.fn();
    const playerContainerRef = createRef<HTMLDivElement>();

    render(
      <RemotionPreview
        ref={previewRef}
        config={makeConfig('scrub-end', 3)}
        onTimeUpdate={onTimeUpdate}
        playerContainerRef={playerContainerRef}
      />,
    );

    act(() => {
      emitPlayerEvent('play');
    });

    const player = playerHandles.at(-1)!;
    player.isPlaying.mockReturnValue(true);

    act(() => {
      // seek exactly to the last frame (89) of the 90-frame clip: Remotion
      // treats reaching the end as "ended", so no resume. (A sloppy
      // `nextFrame < durationInFrames` bound would wrongly resume here.)
      previewRef.current?.seek(89 / 30);
    });

    expect(player.seekTo).toHaveBeenLastCalledWith(89);
    expect(player.play).not.toHaveBeenCalled();
  });
});
