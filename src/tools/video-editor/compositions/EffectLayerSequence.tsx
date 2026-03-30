import type { FC, ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';
import { continuousEffects, lookupEffect } from '@/tools/video-editor/effects';
import { getClipDurationInFrames, secondsToFrames } from '@/tools/video-editor/lib/config-utils';
import type { ResolvedTimelineClip } from '@/tools/video-editor/types';

interface EffectLayerSequenceProps {
  clip: ResolvedTimelineClip;
  fps: number;
  children: ReactNode;
}

/**
 * Conditionally wraps children with a continuous effect during the
 * effect-layer clip's time range. Does NOT use <Sequence> to avoid
 * shifting the time context for children — children keep their own
 * timing relative to the composition root.
 */
export const EffectLayerSequence: FC<EffectLayerSequenceProps> = ({ clip, fps, children }) => {
  const frame = useCurrentFrame();
  const startFrame = Math.max(0, secondsToFrames(clip.at, fps));
  const durationInFrames = getClipDurationInFrames(clip, fps);
  const endFrame = startFrame + durationInFrames;

  // Outside the effect layer's time range — pass children through unchanged
  if (!clip.continuous || frame < startFrame || frame >= endFrame) {
    return <>{children}</>;
  }

  const Effect = lookupEffect(continuousEffects, clip.continuous.type);
  if (!Effect) {
    console.warn('[EffectLayer] effect NOT FOUND for clip=%s type=%s', clip.id, clip.continuous.type);
    return <>{children}</>;
  }

  // Wrap children with the effect — no Sequence, so children keep their
  // original timing. The effect receives the layer's duration for its
  // own animation calculations.
  return (
    <Effect
      durationInFrames={durationInFrames}
      effectFrames={durationInFrames}
      intensity={clip.continuous.intensity ?? 0.5}
      params={clip.continuous.params}
    >
      {children}
    </Effect>
  );
};
