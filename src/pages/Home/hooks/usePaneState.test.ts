import { describe, expect, it } from 'vitest';
import { usePaneState } from './usePaneState';

describe('usePaneState module', () => {
  it('exports hook', () => {
    expect(usePaneState).toBeDefined();
  });
});
