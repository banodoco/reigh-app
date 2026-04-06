import { memo, type FC } from 'react';
import { Sequence } from 'remotion';
import { Audio } from '@remotion/media';
import { getClipDurationInFrames, secondsToFrames } from '@/tools/video-editor/lib/config-utils';
import type { ResolvedTimelineClip, TrackDefinition } from '@/tools/video-editor/types';

const AudioTrackComponent: FC<{
  track: TrackDefinition;
  clips: ResolvedTimelineClip[];
  fps: number;
}> = ({ track, clips, fps }) => {
  return (
    <>
      {clips.map((clip) => {
        const effectiveVolume = track.muted ? 0 : (track.volume ?? 1) * (clip.volume ?? 1);

        return (
          <Sequence
            // Remotion's Sequence + Audio timing is not fully updated by prop changes during playback,
            // so audio clips need a remount whenever timing or playback-rate inputs change.
            key={`${clip.id}-${clip.at}-${clip.from ?? 0}-${clip.to ?? ''}-${clip.speed ?? 1}`}
            from={secondsToFrames(clip.at, fps)}
            durationInFrames={getClipDurationInFrames(clip, fps)}
          >
            {clip.assetEntry ? (
              <Audio
                src={clip.assetEntry.src}
                trimBefore={secondsToFrames(clip.from ?? 0, fps)}
                trimAfter={clip.to ? secondsToFrames(clip.to, fps) : undefined}
                playbackRate={clip.speed ?? 1}
                volume={effectiveVolume}
              />
            ) : null}
          </Sequence>
        );
      })}
    </>
  );
};

export const AudioTrack = memo(AudioTrackComponent);
AudioTrack.displayName = 'AudioTrack';
