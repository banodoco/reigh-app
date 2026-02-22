import { describe, it, expect } from 'vitest';
import { useOptimisticOrder } from '../useOptimisticOrder';

describe('useOptimisticOrder', () => {
  it('exports expected members', () => {
    expect(useOptimisticOrder).toBeDefined();
  });

  it('useOptimisticOrder is a callable function', () => {
    expect(typeof useOptimisticOrder).toBe('function');
    expect(useOptimisticOrder.name).toBeDefined();
  });
});
