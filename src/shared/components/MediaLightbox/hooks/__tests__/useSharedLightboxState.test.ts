import { describe, it, expect } from 'vitest';
import { useSharedVariantsState, useSharedNavigationState, useSharedShotState, useSharedLightboxState } from '../useSharedLightboxState';

describe('useSharedLightboxState', () => {
  it('exports expected members', () => {
    expect(useSharedVariantsState).toBeDefined();
    expect(useSharedNavigationState).toBeDefined();
    expect(useSharedShotState).toBeDefined();
    expect(useSharedLightboxState).toBeDefined();
  });

  it('useSharedVariantsState is a callable function', () => {
    expect(typeof useSharedVariantsState).toBe('function');
    expect(useSharedVariantsState.name).toBeDefined();
  });
});
