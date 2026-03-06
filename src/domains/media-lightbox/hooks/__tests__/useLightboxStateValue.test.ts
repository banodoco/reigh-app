import { describe, it, expect } from 'vitest';
import { useLightboxStateValue } from '../useLightboxStateValue';

describe('useLightboxStateValue', () => {
  it('exports expected members', () => {
    expect(useLightboxStateValue).toBeDefined();
  });

  it('useLightboxStateValue is a callable function', () => {
    expect(typeof useLightboxStateValue).toBe('function');
    expect(useLightboxStateValue.name).toBeDefined();
  });
});
