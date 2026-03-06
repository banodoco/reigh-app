import { describe, it, expect } from 'vitest';
import { useLoraFilters } from '../useLoraFilters';

describe('useLoraFilters', () => {
  it('exports expected members', () => {
    expect(useLoraFilters).toBeDefined();
  });

  it('useLoraFilters is a callable function', () => {
    expect(typeof useLoraFilters).toBe('function');
    expect(useLoraFilters.name).toBeDefined();
  });
});
