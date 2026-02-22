import { describe, it, expect } from 'vitest';
import { useClickOutside } from '../useClickOutside';

describe('useClickOutside', () => {
  it('exports expected members', () => {
    expect(useClickOutside).toBeDefined();
  });

  it('useClickOutside is a callable function', () => {
    expect(typeof useClickOutside).toBe('function');
    expect(useClickOutside.name).toBeDefined();
  });
});
