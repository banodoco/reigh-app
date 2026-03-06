import { describe, it, expect } from 'vitest';
import { useVideoLightboxRenderModel } from '../useVideoLightboxRenderModel';

describe('useVideoLightboxRenderModel', () => {
  it('exports expected members', () => {
    expect(useVideoLightboxRenderModel).toBeDefined();
  });

  it('useVideoLightboxRenderModel is a callable function', () => {
    expect(typeof useVideoLightboxRenderModel).toBe('function');
    expect(useVideoLightboxRenderModel.name).toBeDefined();
  });
});
