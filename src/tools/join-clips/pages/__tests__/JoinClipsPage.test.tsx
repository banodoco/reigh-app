import { describe, it, expect } from 'vitest';
import JoinClipsPage from '../JoinClipsPage';

describe('JoinClipsPage', () => {
  it('exports expected members', () => {
    expect(JoinClipsPage).toBeDefined();
    expect(typeof JoinClipsPage).toBe('function');
  });
});
