import { describe, expect, it } from 'vitest';
import {
  createPublicAstridReadiness,
  reducePublicAstridReadiness,
} from './publicAstridReadiness';

function usableState() {
  let state = createPublicAstridReadiness();
  state = reducePublicAstridReadiness(state, { type: 'module-ready', attempt: 0 });
  state = reducePublicAstridReadiness(state, { type: 'media-fallback', attempt: 0 });
  state = reducePublicAstridReadiness(state, { type: 'inspector-ready', attempt: 0 });
  return reducePublicAstridReadiness(state, { type: 'timeline-ready', attempt: 0 });
}

describe('public Astrid readiness reducer', () => {
  it('ignores duplicate signals without allocating a new state', () => {
    const state = usableState();
    expect(reducePublicAstridReadiness(state, { type: 'media-fallback', attempt: 0 })).toBe(state);
    expect(reducePublicAstridReadiness(state, { type: 'module-ready', attempt: 0 })).toBe(state);
  });

  it('does not regress after presentation has started', () => {
    const usable = usableState();
    const presenting = reducePublicAstridReadiness(usable, { type: 'present', attempt: 0 });
    expect(presenting.phase).toBe('presenting');
    expect(reducePublicAstridReadiness(presenting, { type: 'media-fallback', attempt: 0 })).toBe(presenting);
    expect(reducePublicAstridReadiness(presenting, { type: 'present', attempt: 0 })).toBe(presenting);

    const settled = reducePublicAstridReadiness(presenting, { type: 'settled', attempt: 0 });
    expect(settled.phase).toBe('settled');
    expect(reducePublicAstridReadiness(settled, { type: 'media-fallback', attempt: 0 })).toBe(settled);
  });

  it('rejects events from an older editor attempt', () => {
    const state = createPublicAstridReadiness(2);
    expect(reducePublicAstridReadiness(state, { type: 'module-ready', attempt: 1 })).toBe(state);
  });
});
