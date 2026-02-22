import { describe, it, expect } from 'vitest';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../collapsible';

describe('collapsible', () => {
  it('exports expected members', () => {
    expect(Collapsible).toBeDefined();
    expect(CollapsibleTrigger).toBeDefined();
    expect(CollapsibleContent).toBeDefined();
  });
});
