import type { FC } from 'react';
import { Sequence } from 'remotion';
import { Audio } from '@remotion/media';
import { getClipDurationInFrames, secondsToFrames } from '@/tools/video-editor/lib/config-utils';
import type { ResolvedTimelineClip } from '@/tools/video-editor/types';

export const AudioTrack: FC<{
  trackId: string;
  clips: ResolvedTimelineClip[];
  fps: number;
}> = ({ clips, fps }) => {
  return (
    <>
      {clips.map((clip) => (
        <Sequence
          key={clip.id}
          from={secondsToFrames(clip.at, fps)}
          durationInFrames={getClipDurationInFrames(clip, fps)}
        >
          {clip.assetEntry ? (
            <Audio
              src={clip.assetEntry.src}
              startFrom={secondsToFrames(clip.from ?? 0, fps)}
              playbackRate={clip.speed ?? 1}
              volume={clip.volume ?? 1}
              crossOrigin="anonymous"
            />
          ) : null}
        </Sequence>
      ))}
    </>
  );
};
