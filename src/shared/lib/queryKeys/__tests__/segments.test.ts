import { describe, it, expect } from 'vitest';
import { segmentQueryKeys } from '../segments';

describe('segments', () => {
  it('exports expected members', () => {
    expect(segmentQueryKeys).toBeDefined();
  });
});
