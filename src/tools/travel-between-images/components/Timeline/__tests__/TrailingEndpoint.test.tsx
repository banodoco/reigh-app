import { describe, it, expect } from 'vitest';
import TrailingEndpoint from '../TrailingEndpoint';

describe('TrailingEndpoint', () => {
  it('exports a memo-wrapped component', () => {
    expect(TrailingEndpoint).toBeDefined();
    expect(typeof TrailingEndpoint).toBe('object');
    expect(TrailingEndpoint).toHaveProperty('$$typeof');
  });
});
