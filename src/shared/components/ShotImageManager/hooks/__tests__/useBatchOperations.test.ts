import { describe, it, expect } from 'vitest';
import { useBatchOperations } from '../useBatchOperations';

describe('useBatchOperations', () => {
  it('exports expected members', () => {
    expect(useBatchOperations).toBeDefined();
  });

  it('useBatchOperations is a callable function', () => {
    expect(typeof useBatchOperations).toBe('function');
    expect(useBatchOperations.name).toBeDefined();
  });
});
