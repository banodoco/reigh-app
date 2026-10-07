import { describe, expect, it } from 'vitest';
import { PUBLIC_ASTRID_SKY_REPLAY_MS, PUBLIC_ASTRID_SKY_REPLAY_TURN_MS, replayOffsetHours } from './PublicAstridSky';

describe('mink day replay', () => {
  it('plays a whole day and lands back on the real time', () => {
    expect(replayOffsetHours(0)).toBe(0);
    expect(replayOffsetHours(PUBLIC_ASTRID_SKY_REPLAY_TURN_MS)).toBe(0);
    expect(replayOffsetHours(PUBLIC_ASTRID_SKY_REPLAY_MS)).toBeCloseTo(24);
  });

  it('keeps an even pace through the middle so the night does not rush past', () => {
    const day = PUBLIC_ASTRID_SKY_REPLAY_MS - 1000;
    const speed = (at: number) => replayOffsetHours(PUBLIC_ASTRID_SKY_REPLAY_TURN_MS + at + 10) - replayOffsetHours(PUBLIC_ASTRID_SKY_REPLAY_TURN_MS + at);
    expect(speed(day * 0.5)).toBeCloseTo(speed(day * 0.25), 5);
    let last = -1;
    for (let at = 0; at <= PUBLIC_ASTRID_SKY_REPLAY_MS; at += 50) {
      const offset = replayOffsetHours(at);
      expect(offset).toBeGreaterThanOrEqual(last);
      last = offset;
    }
  });
});
