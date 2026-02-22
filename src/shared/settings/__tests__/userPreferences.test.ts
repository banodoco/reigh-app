import { describe, it, expect } from 'vitest';
import { userPreferencesSettings } from '../userPreferences';

describe('userPreferences', () => {
  it('exports settings object', () => {
    expect(userPreferencesSettings).toBeDefined();
    expect(typeof userPreferencesSettings).toBe('object');
  });
});
