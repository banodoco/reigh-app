import { describe, it, expect } from 'vitest';
import { useSelectedShotResolution } from '../../settings/useSelectedShotResolution';

describe('useSelectedShotResolution', () => {
  it('exports expected members', () => {
    expect(useSelectedShotResolution).toBeDefined();
  });

  it('useSelectedShotResolution is a callable function', () => {
    expect(typeof useSelectedShotResolution).toBe('function');
    expect(useSelectedShotResolution.name).toBeDefined();
  });
});
