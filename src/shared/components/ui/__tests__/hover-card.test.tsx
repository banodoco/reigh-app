import { describe, it, expect } from 'vitest';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '../hover-card';

describe('hover-card', () => {
  it('exports expected members', () => {
    expect(HoverCard).toBeDefined();
    expect(HoverCardTrigger).toBeDefined();
    expect(HoverCardContent).toBeDefined();
  });
});
