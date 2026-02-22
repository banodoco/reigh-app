import { describe, it, expect } from 'vitest';
import { trainingDataHelperSettings } from '../settings';

describe('settings', () => {
  it('exports expected members', () => {
    expect(trainingDataHelperSettings).toBeDefined();
  });

  it('settings have expected shape', () => {
    expect(trainingDataHelperSettings).not.toBeNull();
  });
});
