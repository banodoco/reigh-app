import { describe, it, expect } from 'vitest';
import { useContainerWidth, useContainerDimensions } from '../useContainerWidth';

describe('useContainerWidth', () => {
  it('exports expected members', () => {
    expect(useContainerWidth).toBeDefined();
    expect(useContainerDimensions).toBeDefined();
  });

  it('useContainerWidth is a callable function', () => {
    expect(typeof useContainerWidth).toBe('function');
    expect(useContainerWidth.name).toBeDefined();
  });
});
