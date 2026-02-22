import { describe, it, expect } from 'vitest';
import { useEditSettingsPersistence } from '../useEditSettingsPersistence';

describe('useEditSettingsPersistence', () => {
  it('exports expected members', () => {
    expect(useEditSettingsPersistence).toBeDefined();
  });

  it('useEditSettingsPersistence is a callable function', () => {
    expect(typeof useEditSettingsPersistence).toBe('function');
    expect(useEditSettingsPersistence.name).toBeDefined();
  });
});
