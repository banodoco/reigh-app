import { describe, it, expect } from 'vitest';
import { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants } from '../tabs';

describe('tabs', () => {
  it('exports expected members', () => {
    expect(Tabs).toBeDefined();
    expect(TabsList).toBeDefined();
    expect(TabsTrigger).toBeDefined();
    expect(TabsContent).toBeDefined();
    expect(tabsListVariants).toBeDefined();
  });
});
