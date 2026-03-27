import type { FC, ReactNode } from 'react';
import { Sequence, useCurrentFrame } from 'remotion';
import { continuousEffects, lookupEffect } from '@/tools/video-editor/effects';
import { getClipDurationInFrames, secondsToFrames } from '@/tools/video-editor/lib/config-utils';
import type { ResolvedTimelineClip } from '@/tools/video-editor/types';

interface EffectLayerSequenceProps {
  clip: ResolvedTimelineClip;
  fps: number;
  children: ReactNode;
}

export const EffectLayerSequence: FC<EffectLayerSequenceProps> = ({ clip, fps, children }) => {
  const frame = useCurrentFrame();
  const startFrame = Math.max(0, secondsToFrames(clip.at, fps));
  const durationInFrames = getClipDurationInFrames(clip, fps);
  const endFrame = startFrame + durationInFrames;

  if (!clip.continuous || frame < startFrame || frame >= endFrame) {
    return <>{children}</>;
  }

  const Effect = lookupEffect(continuousEffects, clip.continuous.type);
  if (!Effect) {
    return <>{children}</>;
  }

  return (
    <Sequence from={startFrame} durationInFrames={durationInFrames}>
      <Effect
        durationInFrames={durationInFrames}
        intensity={clip.continuous.intensity ?? 0.5}
        params={clip.continuous.params}
      >
        {children}
      </Effect>
    </Sequence>
  );
};
