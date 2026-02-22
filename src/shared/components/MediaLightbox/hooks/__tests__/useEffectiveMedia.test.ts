import { describe, it, expect } from 'vitest';
import { useEffectiveMedia } from '../useEffectiveMedia';

describe('useEffectiveMedia', () => {
  it('exports expected members', () => {
    expect(useEffectiveMedia).toBeDefined();
  });

  it('useEffectiveMedia is a callable function', () => {
    expect(typeof useEffectiveMedia).toBe('function');
    expect(useEffectiveMedia.name).toBeDefined();
  });
});
