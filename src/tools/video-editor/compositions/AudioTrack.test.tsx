// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioTrack } from '@/tools/video-editor/compositions/AudioTrack';
import { secondsToFrames } from '@/tools/video-editor/lib/config-utils';
import type { ResolvedTimelineClip, TrackDefinition } from '@/tools/video-editor/types';

const sequenceProps: Array<Record<string, unknown>> = [];
const html5AudioProps: Array<Record<string, unknown>> = [];
const mediaAudioProps: Array<Record<string, unknown>> = [];

let currentEnvironment = {
  isRendering: false,
  isClientSideRendering: false,
};

vi.mock('remotion', async () => {
  const React = await import('react');

  return {
    Sequence: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      sequenceProps.push(props);
      return <div data-testid="sequence">{children}</div>;
    },
    Audio: React.forwardRef<HTMLAudioElement, Record<string, unknown>>((props, ref) => {
      html5AudioProps.push(props);
      return (
        <audio
          data-testid="html5-audio"
          src={props.src as string}
          ref={ref}
          onError={props.onError as React.ReactEventHandler<HTMLAudioElement> | undefined}
          onErrorCapture={props.onErrorCapture as React.ReactEventHandler<HTMLAudioElement> | undefined}
        />
      );
    }),
    useRemotionEnvironment: () => currentEnvironment,
  };
});

vi.mock('@remotion/media', () => ({
  Audio: (props: Record<string, unknown>) => {
    mediaAudioProps.push(props);
    return <div data-testid="media-audio" />;
  },
}));

vi.mock('@/tools/video-editor/compositions/MediaErrorBoundary', () => ({
  MediaErrorBoundary: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

const track: TrackDefinition = {
  id: 'A1',
  kind: 'audio',
  label: 'A1',
};

const clip: ResolvedTimelineClip = {
  id: 'clip-1',
  at: 2,
  track: 'A1',
  clipType: 'media',
  asset: 'asset-1',
  from: 1,
  to: 4,
  speed: 1,
  volume: 0.8,
  assetEntry: {
    file: 'audio.mp3',
    src: 'https://example.com/audio.mp3',
    type: 'audio/mpeg',
  },
};

describe('AudioTrack', () => {
  beforeEach(() => {
    sequenceProps.length = 0;
    html5AudioProps.length = 0;
    mediaAudioProps.length = 0;
    currentEnvironment = {
      isRendering: false,
      isClientSideRendering: false,
    };
  });

  it('premounts active audible preview audio and lets the player wait for buffering', () => {
    render(<AudioTrack track={track} clips={[clip]} fps={30} />);

    expect(screen.getByTestId('html5-audio')).toBeInTheDocument();
    expect(sequenceProps[0]?.premountFor).toBe(30);
    expect(html5AudioProps[0]?.pauseWhenBuffering).toBe(true);
    expect(html5AudioProps[0]?.volume).toBe(0.8);
  });

  it.each([
    ['muted track', { ...track, muted: true }, clip],
    ['zero track gain', { ...track, volume: 0 }, clip],
    ['zero clip gain', track, { ...clip, volume: 0 }],
  ])('does not block preview buffering for a %s', (_label, silentTrack, silentClip) => {
    render(<AudioTrack track={silentTrack} clips={[silentClip]} fps={30} />);

    expect(html5AudioProps[0]?.volume).toBe(0);
    expect(html5AudioProps[0]?.pauseWhenBuffering).toBe(false);
  });

  it('captures a terminal native audio error and retries only after an explicit click', () => {
    render(<AudioTrack track={track} clips={[clip]} fps={30} />);

    fireEvent.error(screen.getByTestId('html5-audio'));

    expect(screen.getByRole('alert')).toHaveTextContent('Audio unavailable.');
    expect(screen.queryByTestId('html5-audio')).toBeNull();
    expect(html5AudioProps).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Retry audio' }));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('html5-audio')).toHaveAttribute('src', clip.assetEntry?.src);
    expect(html5AudioProps).toHaveLength(2);
    expect(html5AudioProps.at(-1)?.pauseWhenBuffering).toBe(true);
  });

  it.each([
    ['source', { ...clip, assetEntry: { ...clip.assetEntry!, src: 'https://example.com/replacement.mp3' } }],
    ['timing', { ...clip, at: 5 }],
  ])('clears terminal audio failure when %s identity changes', (_identity, nextClip) => {
    const { rerender } = render(<AudioTrack track={track} clips={[clip]} fps={30} />);

    fireEvent.error(screen.getByTestId('html5-audio'));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(<AudioTrack track={track} clips={[nextClip]} fps={30} />);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('html5-audio')).toHaveAttribute('src', nextClip.assetEntry?.src);
    if (nextClip.at !== clip.at) {
      expect(sequenceProps.at(-1)?.from).toBe(secondsToFrames(nextClip.at, 30));
    }
  });

  it.each(['isRendering', 'isClientSideRendering'] as const)(
    'keeps MediaAudio routing and its installed prop contract during %s', (environmentKey) => {
      currentEnvironment = {
        isRendering: environmentKey === 'isRendering',
        isClientSideRendering: environmentKey === 'isClientSideRendering',
      };

      render(<AudioTrack track={track} clips={[clip]} fps={24} />);

      expect(screen.getByTestId('media-audio')).toBeInTheDocument();
      expect(screen.queryByTestId('html5-audio')).toBeNull();
      expect(sequenceProps[0]?.premountFor).toBe(24);
      expect(mediaAudioProps[0]?.pauseWhenBuffering).toBeUndefined();
      expect(mediaAudioProps[0]?.volume).toBe(0.8);
    },
  );

  it('plays Astrid registry entries that use the generic audio family type', () => {
    const genericAudioClip: ResolvedTimelineClip = {
      ...clip,
      assetEntry: {
        ...clip.assetEntry!,
        type: 'audio',
      },
    };

    render(<AudioTrack track={track} clips={[genericAudioClip]} fps={30} />);

    expect(screen.getByTestId('html5-audio')).toBeInTheDocument();
  });

  it('remounts the audio sequence when a clip moves mid-playback (keyed on at)', () => {
    const { rerender } = render(<AudioTrack track={track} clips={[clip]} fps={30} />);

    const firstSequenceNode = screen.getByTestId('sequence');
    const firstAudioMounters = html5AudioProps.length;

    const movedClip: ResolvedTimelineClip = { ...clip, at: 5 };
    rerender(<AudioTrack track={track} clips={[movedClip]} fps={30} />);

    // The Sequence key includes `at`, so a move remounts the subtree — the only
    // path that re-times Remotion audio during playback.
    expect(screen.getByTestId('sequence')).not.toBe(firstSequenceNode);
    expect(html5AudioProps.length).toBe(firstAudioMounters + 1);
    expect(sequenceProps.at(-1)?.from).toBe(secondsToFrames(5, 30));
  });
});
