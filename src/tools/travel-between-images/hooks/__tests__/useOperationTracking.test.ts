import { describe, it, expect } from 'vitest';
import { useOperationTracking } from '../useOperationTracking';

describe('useOperationTracking', () => {
  it('exports expected members', () => {
    expect(useOperationTracking).toBeDefined();
  });

  it('useOperationTracking is a callable function', () => {
    expect(typeof useOperationTracking).toBe('function');
    expect(useOperationTracking.name).toBeDefined();
  });
});
