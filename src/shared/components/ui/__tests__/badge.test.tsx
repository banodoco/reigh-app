import { describe, it, expect } from 'vitest';
import { Badge, badgeVariants } from '../badge';

describe('badge', () => {
  it('exports expected members', () => {
    expect(Badge).toBeDefined();
    expect(badgeVariants).toBeDefined();
  });
});
