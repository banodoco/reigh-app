import { describe, it, expect } from 'vitest';
import { useEditSettingsSync } from '../useEditSettingsSync';

describe('useEditSettingsSync', () => {
  it('exports expected members', () => {
    expect(useEditSettingsSync).toBeDefined();
  });

  it('useEditSettingsSync is a callable function', () => {
    expect(typeof useEditSettingsSync).toBe('function');
    expect(useEditSettingsSync.name).toBeDefined();
  });
});
