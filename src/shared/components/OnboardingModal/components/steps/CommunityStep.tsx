import { useEffect, useRef, useState } from 'react';
import { DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { DISCORD_URL } from '@/pages/Home/publicAstridLinks';
import { DiscordMark } from '@/pages/Home/PublicAstridSocialLinks';
import { NORTH_STAR_ART, NorthStarMink } from '@/pages/Home/PublicAstridNorthStarArt';
import type { OnboardingStepProps } from '@/shared/components/OnboardingModal/types';

/** How long the invitation stays before onboarding finishes on its own. */
export const COMMUNITY_STEP_AUTO_CLOSE_MS = 10_000;

/**
 * The last step: an open invitation to the community, as the Vision page puts it, with the Discord link.
 * It is entirely optional and never holds anyone up: "I'm ready" finishes onboarding, and so does the
 * step itself after a few seconds. While the pointer or keyboard focus is on it, the countdown waits, so
 * nobody is cut off mid-read or mid-click. Its mink is the Vision page's community one, and plays the same
 * little loop (the star bobbing over the climbers) while the step is hovered, or for a moment on a tap.
 */
export function CommunityStep({ onClose }: OnboardingStepProps) {
  const [remaining, setRemaining] = useState(COMMUNITY_STEP_AUTO_CLOSE_MS);
  const [paused, setPaused] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (paused) return undefined;
    const tick = 100;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - tick)), tick);
    return () => window.clearInterval(timer);
  }, [paused]);

  useEffect(() => {
    if (remaining === 0) onCloseRef.current();
  }, [remaining]);

  const pause = () => setPaused(true);
  const resume = () => setPaused(false);
  // On touch screens there's no hover: a tap plays the mink's loop for a moment instead.
  const [playing, setPlaying] = useState(false);
  const playTimer = useRef<number>();
  const play = () => {
    window.clearTimeout(playTimer.current);
    setPlaying(true);
    playTimer.current = window.setTimeout(() => setPlaying(false), 3000);
  };
  useEffect(() => () => window.clearTimeout(playTimer.current), []);

  return (
    <div
      className="space-y-5"
      data-ns-host
      data-play={playing || undefined}
      onPointerDown={(event) => { if (event.pointerType !== 'mouse') play(); }}
      onPointerEnter={pause}
      onPointerLeave={resume}
      onFocus={pause}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) resume(); }}
    >
      <div className="flex justify-center">
        <NorthStarMink art={NORTH_STAR_ART.community} />
      </div>
      <DialogHeader className="space-y-3 text-center">
        <DialogTitle className="text-center text-2xl font-bold">A community that pushes itself</DialogTitle>
        <p className="text-center text-muted-foreground">
          Astrid is for people who want to make ambitious work, pushing their art and their technical skill, and open
          models, beyond their current limits. We’re building a community of them, learning from each other.
        </p>
        <p className="text-center text-muted-foreground">If you’d like to join us, we’d love to have you on Discord.</p>
      </DialogHeader>
      <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button asChild variant="retro-secondary" size="retro-sm" className="w-full sm:w-auto">
          <a href={DISCORD_URL} target="_blank" rel="noreferrer">
            <DiscordMark />
            <span className="ml-2">Join the Discord</span>
          </a>
        </Button>
        <Button variant="retro" size="retro-sm" onClick={onClose} className="w-full sm:w-auto">
          I’m ready
        </Button>
      </div>
      <div className="mx-auto h-0.5 w-40 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className="h-full rounded-full bg-primary/50 transition-[width] duration-100 ease-linear"
          style={{ width: `${(remaining / COMMUNITY_STEP_AUTO_CLOSE_MS) * 100}%` }}
        />
      </div>
    </div>
  );
}
