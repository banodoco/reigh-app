import { describe, it, expect } from 'vitest';
import BatchSettingsForm from '../BatchSettingsForm';

describe('BatchSettingsForm', () => {
  it('exports expected members', () => {
    expect(BatchSettingsForm).toBeDefined();
    expect(typeof BatchSettingsForm).toBe('function');
  });
});
