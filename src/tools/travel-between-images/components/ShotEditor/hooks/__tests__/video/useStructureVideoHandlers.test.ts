import { describe, it, expect } from 'vitest';
import { useStructureVideoHandlers } from '../../video/useStructureVideoHandlers';

describe('useStructureVideoHandlers', () => {
  it('exports expected members', () => {
    expect(useStructureVideoHandlers).toBeDefined();
  });

  it('useStructureVideoHandlers is a callable function', () => {
    expect(typeof useStructureVideoHandlers).toBe('function');
    expect(useStructureVideoHandlers.name).toBeDefined();
  });
});
