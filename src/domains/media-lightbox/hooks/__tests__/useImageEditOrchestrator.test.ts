import { describe, it, expect } from 'vitest';
import { useImageEditOrchestrator } from '../useImageEditOrchestrator';

describe('useImageEditOrchestrator', () => {
  it('exports expected members', () => {
    expect(useImageEditOrchestrator).toBeDefined();
  });

  it('useImageEditOrchestrator is a callable function', () => {
    expect(typeof useImageEditOrchestrator).toBe('function');
    expect(useImageEditOrchestrator.name).toBeDefined();
  });
});
