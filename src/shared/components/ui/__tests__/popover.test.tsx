import { describe, it, expect } from 'vitest';
import { Popover, PopoverTrigger, PopoverContent } from '../popover';

describe('popover', () => {
  it('exports expected members', () => {
    expect(Popover).toBeDefined();
    expect(PopoverTrigger).toBeDefined();
    expect(PopoverContent).toBeDefined();
  });
});
