import { describe, expect, it } from 'vitest';
import { useHomeAuth } from './useHomeAuth';

describe('useHomeAuth module', () => {
  it('exports hook', () => {
    expect(useHomeAuth).toBeDefined();
  });
});
