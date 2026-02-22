import { describe, it, expect } from 'vitest';
import { useStableMediaUrls } from '../useStableMediaUrls';

describe('useStableMediaUrls', () => {
  it('exports expected members', () => {
    expect(useStableMediaUrls).toBeDefined();
  });

  it('useStableMediaUrls is a callable function', () => {
    expect(typeof useStableMediaUrls).toBe('function');
    expect(useStableMediaUrls.name).toBeDefined();
  });
});
