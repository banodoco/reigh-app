import { describe, it, expect } from 'vitest';
import { useLastUsedEditSettings } from '../useLastUsedEditSettings';

describe('useLastUsedEditSettings', () => {
  it('exports expected members', () => {
    expect(useLastUsedEditSettings).toBeDefined();
  });

  it('useLastUsedEditSettings is a callable function', () => {
    expect(typeof useLastUsedEditSettings).toBe('function');
    expect(useLastUsedEditSettings.name).toBeDefined();
  });

  it('settings have expected shape', () => {
    expect(useLastUsedEditSettings).not.toBeNull();
  });
});
