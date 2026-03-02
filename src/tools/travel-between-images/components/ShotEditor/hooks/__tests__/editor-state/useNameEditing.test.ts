import { describe, it, expect } from 'vitest';
import { useNameEditing } from '../../editor-state/useNameEditing';

describe('useNameEditing', () => {
  it('exports expected members', () => {
    expect(useNameEditing).toBeDefined();
  });

  it('useNameEditing is a callable function', () => {
    expect(typeof useNameEditing).toBe('function');
    expect(useNameEditing.name).toBeDefined();
  });
});
