import { describe, expect, it } from 'vitest';
import * as GlobalHeaderIndex from './index';

describe('GlobalHeader index direct coverage', () => {
  it('exports index module directly', () => {
    expect(GlobalHeaderIndex).toBeDefined();
  });
});
