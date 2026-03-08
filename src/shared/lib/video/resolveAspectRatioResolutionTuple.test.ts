import { describe, expect, it } from 'vitest';
import { resolveAspectRatioResolutionTuple } from './resolveAspectRatioResolutionTuple';

describe('resolveAspectRatioResolutionTuple', () => {
  it('returns resolution tuple for known aspect ratio', () => {
    expect(resolveAspectRatioResolutionTuple('16:9')).toEqual([902, 508]);
  });

  it('returns undefined for unknown/empty aspect ratio', () => {
    expect(resolveAspectRatioResolutionTuple(undefined)).toBeUndefined();
    expect(resolveAspectRatioResolutionTuple('unknown')).toBeUndefined();
  });
});
