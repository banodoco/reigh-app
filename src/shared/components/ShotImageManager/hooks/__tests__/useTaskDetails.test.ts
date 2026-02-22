import { describe, it, expect } from 'vitest';
import { useTaskDetails } from '../useTaskDetails';

describe('useTaskDetails', () => {
  it('exports expected members', () => {
    expect(useTaskDetails).toBeDefined();
  });

  it('useTaskDetails is a callable function', () => {
    expect(typeof useTaskDetails).toBe('function');
    expect(useTaskDetails.name).toBeDefined();
  });
});
