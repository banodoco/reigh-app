import { describe, it, expect } from 'vitest';
import { SelectedPresetCard } from '../SelectedPresetCard';

describe('SelectedPresetCard', () => {
  it('exports a component', () => {
    expect(SelectedPresetCard).toBeDefined();
    expect(typeof SelectedPresetCard).toBe('function');
    expect(SelectedPresetCard.name).toBeDefined();
  });
});
