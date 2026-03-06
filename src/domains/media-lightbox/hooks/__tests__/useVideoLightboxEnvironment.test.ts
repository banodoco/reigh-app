import { describe, it, expect } from 'vitest';
import { useVideoLightboxMode, useVideoLightboxEnvironment } from '../useVideoLightboxEnvironment';

describe('useVideoLightboxEnvironment', () => {
  it('exports expected members', () => {
    expect(useVideoLightboxMode).toBeDefined();
    expect(useVideoLightboxEnvironment).toBeDefined();
  });

  it('useVideoLightboxMode is a callable function', () => {
    expect(typeof useVideoLightboxMode).toBe('function');
    expect(useVideoLightboxMode.name).toBeDefined();
  });
});
