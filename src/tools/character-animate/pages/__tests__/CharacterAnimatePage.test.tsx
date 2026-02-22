import { describe, it, expect } from 'vitest';
import CharacterAnimatePage from '../CharacterAnimatePage';

describe('CharacterAnimatePage', () => {
  it('exports expected members', () => {
    expect(CharacterAnimatePage).toBeDefined();
    expect(typeof CharacterAnimatePage).toBe('function');
  });
});
