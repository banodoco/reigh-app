import { describe, it, expect } from 'vitest';
import { DEFAULT_TRANSFORM, decodeImageTransform } from '../types';

describe('types', () => {
  it('exports expected members', () => {
    expect(DEFAULT_TRANSFORM).toBeDefined();
  });

  it('returns null for non-object transform payloads', () => {
    expect(decodeImageTransform(null)).toBeNull();
    expect(decodeImageTransform('bad')).toBeNull();
    expect(decodeImageTransform([])).toBeNull();
  });

  it('coerces invalid transform fields to defaults', () => {
    const decoded = decodeImageTransform({
      translateX: 12,
      translateY: 'bad',
      scale: Number.NaN,
      rotation: 20,
      flipH: true,
      flipV: 'nope',
    });

    expect(decoded).toEqual({
      translateX: 12,
      translateY: 0,
      scale: 1,
      rotation: 20,
      flipH: true,
      flipV: false,
    });
  });
});
