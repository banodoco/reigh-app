import { describe, expect, it } from 'vitest';
import { useShareMetaTags } from './useShareMetaTags';

describe('useShareMetaTags module', () => {
  it('exports hook', () => {
    expect(useShareMetaTags).toBeDefined();
  });
});
