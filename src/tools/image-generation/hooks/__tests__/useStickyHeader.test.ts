import { describe, it, expect } from 'vitest';
import { useStickyHeader } from '../useStickyHeader';

describe('useStickyHeader', () => {
  it('exports expected members', () => {
    expect(useStickyHeader).toBeDefined();
  });

  it('useStickyHeader is a callable function', () => {
    expect(typeof useStickyHeader).toBe('function');
    expect(useStickyHeader.name).toBeDefined();
  });
});
