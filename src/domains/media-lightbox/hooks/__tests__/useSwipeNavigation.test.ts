import { describe, it, expect } from 'vitest';
import { useSwipeNavigation } from '../useSwipeNavigation';

describe('useSwipeNavigation', () => {
  it('exports expected members', () => {
    expect(useSwipeNavigation).toBeDefined();
  });

  it('useSwipeNavigation is a callable function', () => {
    expect(typeof useSwipeNavigation).toBe('function');
    expect(useSwipeNavigation.name).toBeDefined();
  });
});
