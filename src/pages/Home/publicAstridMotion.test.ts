import { describe, expect, it } from 'vitest';
import { retargetMotionTiming, routeMotionTiming, type PublicAstridExperience } from './publicAstridMotion';

const app: PublicAstridExperience = { audience: 'app' };
const agent: PublicAstridExperience = { audience: 'agent' };

describe('public Astrid route motion', () => {
  it('moves between App and Agent in one shared interval with labels arriving late', () => {
    for (const [from, to] of [[app, agent], [agent, app]] as const) {
      const timing = routeMotionTiming(from, to);
      expect(timing.surfaceDelay).toBe(0);
      expect(timing.surfaceDuration).toBe(720);
      expect(timing.duration).toBe(720);
      expect(timing.labelDelay).toBe(504);
      expect(timing.labelDelay + timing.labelDuration).toBe(720);
    }
  });

  it('scales an early retarget with the remaining displayed travel', () => {
    const timing = retargetMotionTiming(app, agent, { startedAt: 1000, duration: 720, from: agent, to: app }, 1120);
    expect(timing.duration).toBe(120);
    expect(timing.surfaceDuration).toBe(timing.duration);
    expect(timing.surfaceDelay).toBe(0);
    expect(timing.assemblyDuration).toBe(timing.duration);
    expect(timing.assemblyDelay).toBe(0);
    expect(timing.labelDelay).toBe(0);
  });

  it('uses the 120 ms floor for a late retarget and never exceeds normal travel', () => {
    const late = retargetMotionTiming(app, agent, { startedAt: 1000, duration: 720, from: agent, to: app }, 1580);
    expect(late.duration).toBe(580);
    const continued = retargetMotionTiming(app, agent, { startedAt: 1000, duration: 720, from: app, to: agent }, 1600);
    expect(continued.duration).toBe(120);
  });

  it('restores normal timing when the previous route has already settled', () => {
    expect(retargetMotionTiming(app, agent, { startedAt: 1000, duration: 720, from: agent, to: app }, 1800).duration).toBe(720);
  });

  it('returns immediate stable values when there is no destination change', () => {
    expect(retargetMotionTiming(app, app, { startedAt: 1000, duration: 720, from: agent, to: app }, 1120)).toEqual({
      duration: 0,
      assemblyDelay: 0,
      assemblyDuration: 0,
      surfaceDelay: 0,
      surfaceDuration: 0,
      labelDelay: 0,
      labelDuration: 120,
    });
  });
});
