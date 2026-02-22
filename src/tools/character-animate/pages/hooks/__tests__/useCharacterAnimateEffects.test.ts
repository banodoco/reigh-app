import { describe, it, expect } from 'vitest';
import { useCharacterAnimateEffects } from '../useCharacterAnimateEffects';

describe('useCharacterAnimateEffects', () => {
  it('exports expected members', () => {
    expect(useCharacterAnimateEffects).toBeDefined();
  });

  it('useCharacterAnimateEffects is a callable function', () => {
    expect(typeof useCharacterAnimateEffects).toBe('function');
    expect(useCharacterAnimateEffects.name).toBeDefined();
  });
});
