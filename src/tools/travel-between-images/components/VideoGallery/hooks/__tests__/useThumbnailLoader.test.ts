import { describe, it, expect } from 'vitest';
import { useThumbnailLoader } from '../useThumbnailLoader';

describe('useThumbnailLoader', () => {
  it('exports expected members', () => {
    expect(useThumbnailLoader).toBeDefined();
  });

  it('useThumbnailLoader is a callable function', () => {
    expect(typeof useThumbnailLoader).toBe('function');
    expect(useThumbnailLoader.name).toBeDefined();
  });
});
