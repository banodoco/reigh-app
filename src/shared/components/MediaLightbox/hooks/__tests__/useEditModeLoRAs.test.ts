import { describe, it, expect } from 'vitest';
import { useEditModeLoRAs } from '../useEditModeLoRAs';

describe('useEditModeLoRAs', () => {
  it('exports expected members', () => {
    expect(useEditModeLoRAs).toBeDefined();
  });

  it('useEditModeLoRAs is a callable function', () => {
    expect(typeof useEditModeLoRAs).toBe('function');
    expect(useEditModeLoRAs.name).toBeDefined();
  });
});
