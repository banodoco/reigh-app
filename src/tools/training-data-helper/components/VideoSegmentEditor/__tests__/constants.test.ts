import { describe, it, expect } from 'vitest';
import { ASSUMED_FPS, msToSeconds, secondsToMs, POST_CREATE_SEEK_DELAY_MS, FRAME_CAPTURE_INITIAL_DELAY_MS, FRAME_CAPTURE_INTER_DELAY_MS, FRAME_LOAD_DEBOUNCE_MS } from '../constants';

describe('VideoSegmentEditor constants', () => {
  it('exports frame rate constant', () => {
    expect(ASSUMED_FPS).toBe(30);
    expect(typeof ASSUMED_FPS).toBe('number');
  });

  it('converts ms to seconds', () => {
    expect(msToSeconds(1000)).toBe(1);
    expect(msToSeconds(500)).toBe(0.5);
  });

  it('converts seconds to ms', () => {
    expect(secondsToMs(1)).toBe(1000);
    expect(secondsToMs(0.5)).toBe(500);
  });

  it('exports delay constants', () => {
    expect(POST_CREATE_SEEK_DELAY_MS).toBeDefined();
    expect(FRAME_CAPTURE_INITIAL_DELAY_MS).toBeDefined();
    expect(FRAME_CAPTURE_INTER_DELAY_MS).toBeDefined();
    expect(FRAME_LOAD_DEBOUNCE_MS).toBeDefined();
  });
});
