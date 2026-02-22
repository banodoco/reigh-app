import { describe, it, expect } from 'vitest';
import PairRegion from '../PairRegion';

describe('PairRegion', () => {
  it('exports a memo-wrapped component', () => {
    expect(PairRegion).toBeDefined();
    expect(typeof PairRegion).toBe('object');
    expect(PairRegion).toHaveProperty('$$typeof');
  });
});
