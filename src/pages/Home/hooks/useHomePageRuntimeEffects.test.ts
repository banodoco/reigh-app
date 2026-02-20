import { describe, expect, it } from 'vitest';
import { useHomePageRuntimeEffects } from './useHomePageRuntimeEffects';

describe('useHomePageRuntimeEffects module', () => {
  it('exports hook', () => {
    expect(useHomePageRuntimeEffects).toBeDefined();
  });
});
