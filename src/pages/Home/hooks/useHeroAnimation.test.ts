import { describe, expect, it } from 'vitest';
import { useHeroAnimation } from './useHeroAnimation';

describe('useHeroAnimation module', () => {
  it('exports hook', () => {
    expect(useHeroAnimation).toBeDefined();
  });
});
