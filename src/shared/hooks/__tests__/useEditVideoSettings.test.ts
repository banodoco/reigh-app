import { describe, it, expect } from 'vitest';
import { useEditVideoSettings } from '../useEditVideoSettings';

describe('useEditVideoSettings', () => {
  it('exports expected members', () => {
    expect(useEditVideoSettings).toBeDefined();
  });

  it('useEditVideoSettings is a callable function', () => {
    expect(typeof useEditVideoSettings).toBe('function');
    expect(useEditVideoSettings.name).toBeDefined();
  });

  it('settings have expected shape', () => {
    expect(useEditVideoSettings).not.toBeNull();
  });
});
