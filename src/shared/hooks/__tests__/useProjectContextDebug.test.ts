import { describe, it, expect } from 'vitest';
import { useProjectContextDebug } from '../useProjectContextDebug';

describe('useProjectContextDebug', () => {
  it('exports expected members', () => {
    expect(useProjectContextDebug).toBeDefined();
  });

  it('useProjectContextDebug is a callable function', () => {
    expect(typeof useProjectContextDebug).toBe('function');
    expect(useProjectContextDebug.name).toBeDefined();
  });
});
