import { AbsoluteFill } from 'remotion';
import { memo, useMemo, type FC, type ReactNode } from 'react';
import { getAudioTracks, getVisualTracks } from '@/tools/video-editor/lib/editor-utils';
import type { ResolvedTimelineClip, ResolvedTimelineConfig, TrackDefinition } from '@/tools/video-editor/types';
import { AudioTrack } from '@/tools/video-editor/compositions/AudioTrack';
import { EffectLayerSequence } from '@/tools/video-editor/compositions/EffectLayerSequence';
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
  if (sortedClips.length === 0) {
    return null;
  }

  return (
    <AbsoluteFill
      key={track.id}
      style={{
        opacity: track.opacity ?? 1,
        mixBlendMode: track.blendMode && track.blendMode !== 'normal' ? track.blendMode : undefined,
      }}
    >
      {sortedClips.map((clip, index) => {
        if (clip.clipType === 'effect-layer') {
          return null;
        }

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
    return config.clips.reduce<{
      regular: Record<string, ResolvedTimelineClip[]>;
      effectLayers: Record<string, ResolvedTimelineClip[]>;
      all: Record<string, ResolvedTimelineClip[]>;
    }>((groups, clip) => {
      groups.all[clip.track] ??= [];
      groups.all[clip.track].push(clip);
      if (clip.clipType === 'effect-layer') {
        groups.effectLayers[clip.track] ??= [];
        groups.effectLayers[clip.track].push(clip);
      } else {
        groups.regular[clip.track] ??= [];
        groups.regular[clip.track].push(clip);
      }
      return groups;
    }, { regular: {}, effectLayers: {}, all: {} });
  }, [config]);
  const visualContent = useMemo(() => {
    let accumulated: ReactNode = null;

    for (const track of visualTracks) {
      const trackContent = renderVisualTrack(track, clipsByTrack.regular[track.id] ?? [], fps);
      let lowerTrackContent = accumulated;
      const effectLayers = sortClipsByAt(clipsByTrack.effectLayers[track.id] ?? []);

      if (lowerTrackContent && effectLayers.length > 0) {
        for (const effectLayer of effectLayers) {
          lowerTrackContent = (
            <EffectLayerSequence key={effectLayer.id} clip={effectLayer} fps={fps}>
              {lowerTrackContent}
            </EffectLayerSequence>
          );
        }
      }

      accumulated = lowerTrackContent && trackContent
        ? <>{lowerTrackContent}{trackContent}</>
        : (trackContent ?? lowerTrackContent);
    }

    return accumulated;
  }, [clipsByTrack.effectLayers, clipsByTrack.regular, fps, visualTracks]);

  return (
    <AbsoluteFill style={{ backgroundColor: 'black', overflow: 'hidden' }}>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <AbsoluteFill style={{ position: 'relative', overflow: 'hidden' }}>{visualContent}</AbsoluteFill>
      </AbsoluteFill>
      {audioTracks.map((track) => (
        <AudioTrack
          key={track.id}
          trackId={track.id}
          clips={clipsByTrack.all[track.id] ?? []}
          fps={fps}
        />
      ))}
    </AbsoluteFill>
  );
});
