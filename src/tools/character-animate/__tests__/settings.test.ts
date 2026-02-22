import { describe, it, expect } from 'vitest';
import { characterAnimateSettings } from '../settings';

describe('settings', () => {
  it('exports expected members', () => {
    expect(characterAnimateSettings).toBeDefined();
  });

  it('settings have expected shape', () => {
    expect(characterAnimateSettings).not.toBeNull();
  });
});
