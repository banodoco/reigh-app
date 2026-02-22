import { describe, it, expect } from 'vitest';
import { useLightboxVideoMode } from '../useLightboxVideoMode';

describe('useLightboxVideoMode', () => {
  it('exports expected members', () => {
    expect(useLightboxVideoMode).toBeDefined();
  });

  it('useLightboxVideoMode is a callable function', () => {
    expect(typeof useLightboxVideoMode).toBe('function');
    expect(useLightboxVideoMode.name).toBeDefined();
  });
});
