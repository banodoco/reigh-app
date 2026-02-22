import { describe, it, expect } from 'vitest';
import { usePresetSampleFiles } from '../usePresetSampleFiles';

describe('usePresetSampleFiles', () => {
  it('exports expected members', () => {
    expect(usePresetSampleFiles).toBeDefined();
  });

  it('usePresetSampleFiles is a callable function', () => {
    expect(typeof usePresetSampleFiles).toBe('function');
    expect(usePresetSampleFiles.name).toBeDefined();
  });
});
