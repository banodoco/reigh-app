import { describe, it, expect } from 'vitest';
import { useShotSettingsContext, useShotCore, useShotUI, useShotLoras, useShotImages } from '../ShotSettingsContext';

describe('ShotSettingsContext', () => {
  it('exports expected members', () => {
    expect(useShotSettingsContext).toBeDefined();
    expect(useShotCore).toBeDefined();
    expect(useShotUI).toBeDefined();
    expect(useShotLoras).toBeDefined();
    expect(useShotImages).toBeDefined();
  });
});
