import { describe, it, expect } from 'vitest';
import { GlobalHeader } from '../index';

describe('index', () => {
  it('exports expected members', () => {
    expect(GlobalHeader).toBeDefined();
  });
});
