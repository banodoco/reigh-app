import { describe, it, expect } from 'vitest';
import { useShotSettingsValue } from '../../editor-state/useShotSettingsValue';

describe('useShotSettingsValue', () => {
  it('exports expected members', () => {
    expect(useShotSettingsValue).toBeDefined();
  });

  it('useShotSettingsValue is a callable function', () => {
    expect(typeof useShotSettingsValue).toBe('function');
    expect(useShotSettingsValue.name).toBeDefined();
  });
});
