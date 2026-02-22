import { describe, it, expect } from 'vitest';
import { useButtonGroupProps } from '../useButtonGroupProps';

describe('useButtonGroupProps', () => {
  it('exports expected members', () => {
    expect(useButtonGroupProps).toBeDefined();
  });

  it('useButtonGroupProps is a callable function', () => {
    expect(typeof useButtonGroupProps).toBe('function');
    expect(useButtonGroupProps.name).toBeDefined();
  });
});
