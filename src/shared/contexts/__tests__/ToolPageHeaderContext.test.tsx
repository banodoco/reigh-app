import { describe, it, expect } from 'vitest';
import { ToolPageHeaderProvider, useHeaderState } from '../ToolPageHeaderContext';

describe('ToolPageHeaderContext', () => {
  it('exports expected members', () => {
    expect(ToolPageHeaderProvider).toBeDefined();
    expect(useHeaderState).toBeDefined();
  });
});
