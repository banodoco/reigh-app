import { describe, expect, it } from 'vitest';
import { SELECTION_COLORS } from './types';

describe('video portion timeline types', () => {
  it('exposes a stable selection color palette', () => {
    expect(SELECTION_COLORS).toEqual([
      'bg-primary',
      'bg-blue-500',
      'bg-green-500',
      'bg-orange-500',
      'bg-purple-500',
    ]);
  });

  it('keeps at least one fallback color available', () => {
    expect(SELECTION_COLORS.length).toBeGreaterThan(0);
    expect(SELECTION_COLORS[0]).toBe('bg-primary');
  });
});
