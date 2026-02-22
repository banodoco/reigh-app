import { describe, it, expect } from 'vitest';
import { useLightboxNavigation } from '../useLightboxNavigation';

describe('useLightboxNavigation', () => {
  it('exports expected members', () => {
    expect(useLightboxNavigation).toBeDefined();
  });

  it('useLightboxNavigation is a callable function', () => {
    expect(typeof useLightboxNavigation).toBe('function');
    expect(useLightboxNavigation.name).toBeDefined();
  });
});
