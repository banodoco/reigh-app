import { describe, expect, it } from 'vitest';
import { useHomePagePreload } from './useHomePagePreload';

describe('useHomePagePreload module', () => {
  it('exports hook', () => {
    expect(useHomePagePreload).toBeDefined();
  });
});
