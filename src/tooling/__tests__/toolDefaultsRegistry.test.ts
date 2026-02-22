import { describe, it, expect } from 'vitest';
import { toolDefaultsRegistry } from '../toolDefaultsRegistry';

describe('toolDefaultsRegistry', () => {
  it('exports expected members', () => {
    expect(toolDefaultsRegistry).toBeDefined();
  });
});
