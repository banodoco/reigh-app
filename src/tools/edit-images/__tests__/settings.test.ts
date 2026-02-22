import { describe, it, expect } from 'vitest';
import { editImagesSettings } from '../settings';

describe('settings', () => {
  it('exports expected members', () => {
    expect(editImagesSettings).toBeDefined();
  });

  it('settings have expected shape', () => {
    expect(editImagesSettings).not.toBeNull();
  });
});
