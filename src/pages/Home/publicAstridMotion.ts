export type PublicAstridAudience = 'app' | 'agent';

/** Length of the colour crossfade when switching sides; mirrored by the ::view-transition rule in PublicAstridShell.css. */
export const THEME_WASH_MS = 650;
export type PublicAstridExperience = { audience: PublicAstridAudience };

export type PublicAstridMotionTiming = {
  duration: number;
  assemblyDelay: number;
  assemblyDuration: number;
  surfaceDelay: number;
  surfaceDuration: number;
  labelDelay: number;
  labelDuration: number;
};

export type PublicAstridMotionClock = {
  startedAt: number;
  duration: number;
  from: PublicAstridExperience;
  to: PublicAstridExperience;
} | null;

const stoppedTiming = (): PublicAstridMotionTiming => ({
  duration: 0,
  assemblyDelay: 0,
  assemblyDuration: 0,
  surfaceDelay: 0,
  surfaceDuration: 0,
  labelDelay: 0,
  labelDuration: 120,
});

/** Route choreography between the App and Agent views before accounting for an interrupted movement. */
export function routeMotionTiming(from: PublicAstridExperience, to: PublicAstridExperience): PublicAstridMotionTiming {
  const timing = stoppedTiming();
  if (from.audience === to.audience) return timing;

  // The page's colours wash over (THEME_WASH_MS, the view transition) for the same time the panels
  // travel. The panels and labels are kept out of that crossfade, so nothing ghosts as it moves.
  const travel = 650;
  timing.surfaceDelay = 0;
  timing.surfaceDuration = travel;
  timing.assemblyDelay = 0;
  timing.assemblyDuration = travel;
  timing.duration = travel;
  // Labels arrive once the surfaces have mostly settled into their new places.
  timing.labelDelay = Math.round(travel * 0.7);
  timing.labelDuration = timing.duration - timing.labelDelay;
  return timing;
}

/**
 * Retarget from the currently displayed pose. The browser interpolates from its
 * in-flight computed transforms; a retarget uses one shared travel interval so
 * delayed choreography cannot compress a panel's actual movement below the
 * documented 120 ms floor.
 */
export function retargetMotionTiming(
  from: PublicAstridExperience,
  to: PublicAstridExperience,
  previous: PublicAstridMotionClock,
  now: number,
): PublicAstridMotionTiming {
  const base = routeMotionTiming(from, to);
  if (base.duration === 0 || !previous || previous.duration <= 0) return base;

  const elapsed = Math.max(0, now - previous.startedAt);
  if (elapsed >= previous.duration) return base;

  // Progress is measured over the panels' travel only; the colour wash before it moves nothing.
  const travel = base.surfaceDuration;
  const delay = Math.max(0, previous.duration - travel);
  const progress = Math.max(0, Math.min(1, (elapsed - delay) / Math.max(1, previous.duration - delay)));
  const isReversal = to.audience === previous.from.audience;
  const isContinuationTarget = to.audience === previous.to.audience;
  const travelRatio = isReversal ? progress : isContinuationTarget ? 1 - progress : 1;
  const duration = Math.min(travel, Math.max(120, Math.round(travel * travelRatio)));
  return {
    duration,
    assemblyDelay: 0,
    assemblyDuration: duration,
    surfaceDelay: 0,
    surfaceDuration: duration,
    labelDelay: 0,
    labelDuration: Math.min(120, duration),
  };
}
