import { describe, it, expect } from 'vitest';
import { useVideoLightboxSharedState, useVideoLightboxEditing } from '../useVideoLightboxController';

describe('useVideoLightboxController', () => {
  it('exports expected members', () => {
    expect(useVideoLightboxSharedState).toBeDefined();
    expect(useVideoLightboxEditing).toBeDefined();
  });

  it('useVideoLightboxSharedState is a callable function', () => {
    expect(typeof useVideoLightboxSharedState).toBe('function');
    expect(useVideoLightboxSharedState.name).toBeDefined();
  });
});
