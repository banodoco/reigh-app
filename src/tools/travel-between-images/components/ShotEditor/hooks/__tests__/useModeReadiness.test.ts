import { describe, it, expect } from 'vitest';
import { useModeReadiness } from '../useModeReadiness';

describe('useModeReadiness', () => {
  it('exports expected members', () => {
    expect(useModeReadiness).toBeDefined();
  });

  it('useModeReadiness is a callable function', () => {
    expect(typeof useModeReadiness).toBe('function');
    expect(useModeReadiness.name).toBeDefined();
  });
});
