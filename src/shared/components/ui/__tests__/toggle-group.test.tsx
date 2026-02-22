import { describe, it, expect } from 'vitest';
import { ToggleGroup, ToggleGroupItem, toggleGroupVariants, toggleGroupItemVariants } from '../toggle-group';

describe('toggle-group', () => {
  it('exports expected members', () => {
    expect(ToggleGroup).toBeDefined();
    expect(ToggleGroupItem).toBeDefined();
    expect(toggleGroupVariants).toBeDefined();
    expect(toggleGroupItemVariants).toBeDefined();
  });
});
