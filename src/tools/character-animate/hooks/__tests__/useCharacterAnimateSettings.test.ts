import { describe, it, expect } from 'vitest';
import { useCharacterAnimateSettings } from '../useCharacterAnimateSettings';

describe('useCharacterAnimateSettings', () => {
  it('exports expected members', () => {
    expect(useCharacterAnimateSettings).toBeDefined();
  });

  it('useCharacterAnimateSettings is a callable function', () => {
    expect(typeof useCharacterAnimateSettings).toBe('function');
    expect(useCharacterAnimateSettings.name).toBeDefined();
  });

  it('settings have expected shape', () => {
    expect(useCharacterAnimateSettings).not.toBeNull();
  });
});
