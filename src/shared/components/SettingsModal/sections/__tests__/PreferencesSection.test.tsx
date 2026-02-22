import { describe, it, expect } from 'vitest';
import PreferencesSection from '../PreferencesSection';

describe('PreferencesSection', () => {
  it('exports expected members', () => {
    expect(PreferencesSection).toBeDefined();
    expect(typeof PreferencesSection).toBe('function');
  });
});
