import { describe, it, expect } from 'vitest';
import { useSharedVariantsState, useSharedLightboxState } from '../useSharedLightboxState';

describe('useSharedLightboxState', () => {
  it('exports expected members', () => {
    expect(useSharedVariantsState).toBeDefined();
    expect(useSharedLightboxState).toBeDefined();
  });

  it('useSharedVariantsState is a callable function', () => {
    expect(typeof useSharedVariantsState).toBe('function');
    expect(useSharedVariantsState.name).toBeDefined();
  });
});
