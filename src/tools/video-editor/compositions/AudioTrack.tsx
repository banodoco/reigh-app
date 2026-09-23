import { memo, type FC } from 'react';
import { Audio as Html5Audio, Sequence, useRemotionEnvironment } from 'remotion';
import { Audio as MediaAudio } from '@remotion/media';
import {
  getClipDurationInFrames,
  getSanitizedMediaSrc,
  getSanitizedMediaTrimProps,
  getSanitizedPlaybackRate,
  getSanitizedVolume,
  secondsToFrames,
} from '@/tools/video-editor/lib/config-utils.ts';
import { MediaErrorBoundary } from '@/tools/video-editor/compositions/MediaErrorBoundary.tsx';
import type { ResolvedTimelineClip, TrackDefinition } from '@/tools/video-editor/types/index.ts';
import { boundCanonicalClipToOccurrence } from '@/tools/video-editor/lib/canonicalRenderBounds.ts';

const AudioTrackComponent: FC<{
  track: TrackDefinition;
  clips: ResolvedTimelineClip[];
  fps: number;
}> = ({ track, clips, fps }) => {
  const environment = useRemotionEnvironment();
  const AudioComponent = environment.isRendering || environment.isClientSideRendering
    ? MediaAudio
    : Html5Audio;

  return (
    <>
      {clips.map((clip) => {
        const boundedClip = boundCanonicalClipToOccurrence(clip);
        if (!boundedClip) return null;
        const renderClip = boundedClip;
        const mediaSrc = getSanitizedMediaSrc(renderClip.assetEntry?.src);
        const assetType = renderClip.assetEntry?.type?.toLowerCase() ?? '';
        // Astrid's registry uses both MIME types (for example audio/mpeg) and
        // the canonical media-family values (audio/video). Treat both forms
        // as playable here; otherwise generic `audio` entries silently vanish
        // while later clips with MIME metadata still play.
        const isPlayableAudio = assetType === 'audio'
          || assetType === 'video'
          || assetType.startsWith('audio/')
          || assetType.startsWith('video/');
        const effectiveVolume = track.muted ? 0 : getSanitizedVolume(track.volume) * getSanitizedVolume(renderClip.volume);
        const playbackRate = getSanitizedPlaybackRate(renderClip.speed);
        const trimProps = getSanitizedMediaTrimProps(renderClip, fps);

        return (
          <Sequence
            // Remotion's Sequence + Audio timing is not fully updated by prop changes during playback,
            // so audio clips need a remount whenever timing or playback-rate inputs change.
            key={`${renderClip.id}-${renderClip.at}-${renderClip.from ?? 0}-${renderClip.to ?? ''}-${renderClip.speed ?? 1}`}
            from={secondsToFrames(renderClip.at, fps)}
            durationInFrames={getClipDurationInFrames(renderClip, fps)}
            premountFor={renderClip.app?.canonicalTiming ? 0 : fps}
          >
            {mediaSrc && isPlayableAudio ? (
              <MediaErrorBoundary
                clipId={renderClip.id}
                resetKey={`${renderClip.id}:${mediaSrc}:${trimProps.trimBefore}:${trimProps.trimAfter ?? 'none'}:${playbackRate}:${effectiveVolume}:audio`}
                fallback={null}
              >
                <AudioComponent
                  src={mediaSrc}
                  trimBefore={trimProps.trimBefore}
                  trimAfter={trimProps.trimAfter}
                  playbackRate={playbackRate}
                  volume={effectiveVolume}
                  // In the interactive player, blocking playback on every transient audio
                  // buffer underrun causes the preview to "randomly" pause. Let clips
                  // preload via premounting instead of hard-pausing the whole player.
                  pauseWhenBuffering={false}
                />
              </MediaErrorBoundary>
            ) : null}
          </Sequence>
        );
      })}
    </>
  );
};

export const AudioTrack = memo(AudioTrackComponent);
AudioTrack.displayName = 'AudioTrack';
