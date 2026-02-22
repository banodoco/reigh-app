import { describe, it, expect } from 'vitest';
import { useMobileGestures } from '../useMobileGestures';

describe('useMobileGestures', () => {
  it('exports expected members', () => {
    expect(useMobileGestures).toBeDefined();
  });

  it('useMobileGestures is a callable function', () => {
    expect(typeof useMobileGestures).toBe('function');
    expect(useMobileGestures.name).toBeDefined();
  });
});
