import { describe, it, expect } from 'vitest';
import { SHOT_FILTER, isSpecialFilter } from '../filterConstants';

describe('SHOT_FILTER constants', () => {
  it('has expected values', () => {
    expect(SHOT_FILTER.ALL).toBe('all');
    expect(SHOT_FILTER.NO_SHOT).toBe('no-shot');
  });
});

describe('isSpecialFilter', () => {
  it('returns true for "all"', () => {
    expect(isSpecialFilter('all')).toBe(true);
  });

  it('returns true for "no-shot"', () => {
    expect(isSpecialFilter('no-shot')).toBe(true);
  });

  it('returns false for UUID shot IDs', () => {
    expect(isSpecialFilter('12345678-1234-1234-1234-123456789abc')).toBe(false);
  });

  it('returns false for arbitrary strings', () => {
    expect(isSpecialFilter('something-else')).toBe(false);
    expect(isSpecialFilter('')).toBe(false);
  });
});
