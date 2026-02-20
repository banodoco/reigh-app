import { describe, expect, it } from 'vitest';
import { useHeroVideo } from './useHeroVideo';

describe('useHeroVideo module', () => {
  it('exports hook', () => {
    expect(useHeroVideo).toBeDefined();
  });
});
