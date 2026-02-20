import { describe, expect, it } from 'vitest';
import { useHomePageTheme } from './useHomePageTheme';

describe('useHomePageTheme module', () => {
  it('exports hook', () => {
    expect(useHomePageTheme).toBeDefined();
  });
});
