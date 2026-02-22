import { describe, it, expect } from 'vitest';
import { useVideoElementIntegration } from '../useVideoElementIntegration';

describe('useVideoElementIntegration', () => {
  it('exports expected members', () => {
    expect(useVideoElementIntegration).toBeDefined();
  });

  it('useVideoElementIntegration is a callable function', () => {
    expect(typeof useVideoElementIntegration).toBe('function');
    expect(useVideoElementIntegration.name).toBeDefined();
  });
});
