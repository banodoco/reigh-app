import { describe, expect, it } from 'vitest';
import { useDiscordSignIn } from './useDiscordSignIn';

describe('useDiscordSignIn module', () => {
  it('exports hook', () => {
    expect(useDiscordSignIn).toBeDefined();
  });
});
