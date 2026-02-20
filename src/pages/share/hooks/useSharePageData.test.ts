import { describe, expect, it } from 'vitest';
import { useSharePageData } from './useSharePageData';

describe('useSharePageData module', () => {
  it('exports hook', () => {
    expect(useSharePageData).toBeDefined();
  });
});
