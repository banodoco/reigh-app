import { describe, it, expect } from 'vitest';
import DropIndicator from '../DropIndicator';

describe('DropIndicator', () => {
  it('exports expected members', () => {
    expect(DropIndicator).toBeDefined();
    expect(typeof DropIndicator).toBe('function');
  });
});
