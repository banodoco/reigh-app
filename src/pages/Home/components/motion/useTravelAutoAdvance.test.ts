import { describe, expect, it } from 'vitest';
import { useTravelAutoAdvance } from './useTravelAutoAdvance';

describe('useTravelAutoAdvance module', () => {
  it('exports hook', () => {
    expect(useTravelAutoAdvance).toBeDefined();
  });
});
