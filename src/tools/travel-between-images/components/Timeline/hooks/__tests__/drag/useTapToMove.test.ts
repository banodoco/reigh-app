import { describe, it, expect } from 'vitest';
import { useTapToMove } from '../../drag/useTapToMove';

describe('useTapToMove', () => {
  it('exports expected members', () => {
    expect(useTapToMove).toBeDefined();
  });

  it('useTapToMove is a callable function', () => {
    expect(typeof useTapToMove).toBe('function');
    expect(useTapToMove.name).toBeDefined();
  });
});
