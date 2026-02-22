import { describe, it, expect } from 'vitest';
import { useRenderLogger, useChangedDepsLogger } from '../debugRendering';

describe('debugRendering', () => {
  it('exports expected members', () => {
    expect(useRenderLogger).toBeDefined();
    expect(useChangedDepsLogger).toBeDefined();
  });
});
