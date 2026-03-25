import { AbsoluteFill } from 'remotion';
import { memo, useMemo, type FC } from 'react';
import { getAudioTracks, getVisualTracks } from '@/tools/video-editor/lib/editor-utils';
import type { ResolvedTimelineClip, ResolvedTimelineConfig, TrackDefinition } from '@/tools/video-editor/types';
import { AudioTrack } from '@/tools/video-editor/compositions/AudioTrack';
import { TextClipSequence } from '@/tools/video-editor/compositions/TextClip';
import { VisualClipSequence } from '@/tools/video-editor/compositions/VisualClip';

const sortClipsByAt = (clips: ResolvedTimelineClip[]): ResolvedTimelineClip[] => {
  return [...clips].sort((left, right) => left.at - right.at);
};

const renderVisualTrack = (
  track: TrackDefinition,
  clips: ResolvedTimelineClip[],
  fps: number,
) => {
  const sortedClips = sortClipsByAt(clips);
  return (
    <AbsoluteFill
      key={track.id}
      style={{
        opacity: track.opacity ?? 1,
        mixBlendMode: track.blendMode && track.blendMode !== 'normal' ? track.blendMode : undefined,
      }}
    >
      {sortedClips.map((clip, index) => {
        if (clip.clipType === 'text') {
          return <TextClipSequence key={clip.id} clip={clip} track={track} fps={fps} />;
        }

        const predecessor = index > 0 ? sortedClips[index - 1] : null;
        const hasPositionOverride = (
          clip.x !== undefined
          || clip.y !== undefined
          || clip.width !== undefined
          || clip.height !== undefined
          || clip.cropTop !== undefined
          || clip.cropBottom !== undefined
          || clip.cropLeft !== undefined
          || clip.cropRight !== undefined
        );
        if (hasPositionOverride) {
          return (
            <VisualClipSequence
              key={clip.id}
              clip={clip}
              track={track}
              fps={fps}
              predecessor={predecessor}
            />
          );
        }

        return (
          <AbsoluteFill
            key={clip.id}
            style={{
              transform: `scale(${track.scale ?? 1})`,
              transformOrigin: 'center center',
              overflow: 'hidden',
            }}
          >
            <VisualClipSequence
              clip={clip}
              track={track}
              fps={fps}
              predecessor={predecessor}
            />
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};

export const TimelineRenderer: FC<{ config: ResolvedTimelineConfig }> = memo(({ config }) => {
  const fps = config.output.fps;
  const visualTracks = useMemo(() => [...getVisualTracks(config)].reverse(), [config]);
  const audioTracks = useMemo(() => getAudioTracks(config), [config]);
  const clipsByTrack = useMemo(() => {
    return config.clips.reduce<Record<string, ResolvedTimelineClip[]>>((groups, clip) => {
      groups[clip.track] ??= [];
      groups[clip.track].push(clip);
      return groups;
    }, {});
  }, [config]);

  return (
    <AbsoluteFill style={{ backgroundColor: 'black', overflow: 'hidden' }}>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <AbsoluteFill style={{ position: 'relative', overflow: 'hidden' }}>
          {visualTracks.map((track) => {
            const trackClips = clipsByTrack[track.id] ?? [];
            return renderVisualTrack(track, trackClips, fps);
          })}
        </AbsoluteFill>
      </AbsoluteFill>
      {audioTracks.map((track) => (
        <AudioTrack
          key={track.id}
          trackId={track.id}
          clips={clipsByTrack[track.id] ?? []}
          fps={fps}
        />
      ))}
    </AbsoluteFill>
  );
});
