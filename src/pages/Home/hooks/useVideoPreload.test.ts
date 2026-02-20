import { describe, expect, it } from 'vitest';
import { useVideoPreload } from './useVideoPreload';

describe('useVideoPreload module', () => {
  it('exports hook', () => {
    expect(useVideoPreload).toBeDefined();
  });
});
