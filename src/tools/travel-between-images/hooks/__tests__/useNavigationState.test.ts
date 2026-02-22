import { describe, it, expect } from 'vitest';
import { useNavigationState } from '../useNavigationState';

describe('useNavigationState', () => {
  it('exports expected members', () => {
    expect(useNavigationState).toBeDefined();
  });

  it('useNavigationState is a callable function', () => {
    expect(typeof useNavigationState).toBe('function');
    expect(useNavigationState.name).toBeDefined();
  });
});
