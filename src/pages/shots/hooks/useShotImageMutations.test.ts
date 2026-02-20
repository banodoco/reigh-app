import { describe, expect, it } from 'vitest';
import { useShotImageMutations } from './useShotImageMutations';

describe('useShotImageMutations module', () => {
  it('exports hook', () => {
    expect(useShotImageMutations).toBeDefined();
  });
});
