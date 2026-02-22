import { describe, it, expect } from 'vitest';
import { ScrollArea, ScrollBar } from '../scroll-area';

describe('scroll-area', () => {
  it('exports expected members', () => {
    expect(ScrollArea).toBeDefined();
    expect(ScrollBar).toBeDefined();
  });
});
