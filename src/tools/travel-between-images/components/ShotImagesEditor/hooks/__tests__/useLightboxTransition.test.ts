import { describe, it, expect } from 'vitest';
import { useLightboxTransition } from '../useLightboxTransition';

describe('useLightboxTransition', () => {
  it('exports expected members', () => {
    expect(useLightboxTransition).toBeDefined();
  });

  it('useLightboxTransition is a callable function', () => {
    expect(typeof useLightboxTransition).toBe('function');
    expect(useLightboxTransition.name).toBeDefined();
  });
});
