import { describe, it, expect } from 'vitest';
import { Toggle, toggleVariants } from '../toggle';

describe('toggle', () => {
  it('exports expected members', () => {
    expect(Toggle).toBeDefined();
    expect(toggleVariants).toBeDefined();
  });
});
