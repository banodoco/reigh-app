import { describe, expect, it } from 'vitest';
import { useShotSelection } from './useShotSelection';

describe('useShotSelection module', () => {
  it('exports hook', () => {
    expect(useShotSelection).toBeDefined();
  });
});
