import { describe, it, expect } from 'vitest';
import * as imageHandlersModule from '../imageHandlers';

describe('imageHandlers', () => {
  it('exports expected members', () => {
    expect(imageHandlersModule).toBeDefined();
    expect(typeof imageHandlersModule).toBe('object');
  });
});
