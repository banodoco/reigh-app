import { describe, it, expect } from 'vitest';
import { useShotPositioning } from '../useShotPositioning';

describe('useShotPositioning', () => {
  it('exports expected members', () => {
    expect(useShotPositioning).toBeDefined();
  });

  it('useShotPositioning is a callable function', () => {
    expect(typeof useShotPositioning).toBe('function');
    expect(useShotPositioning.name).toBeDefined();
  });
});
