import { describe, it, expect } from 'vitest';
import { useShotActions } from '../../actions/useShotActions';

describe('useShotActions', () => {
  it('exports a hook function', () => {
    expect(useShotActions).toBeDefined();
    expect(typeof useShotActions).toBe('function');
    expect(useShotActions.name).toBe('useShotActions');
  });
});
