import { describe, it, expect } from 'vitest';
import { Command, CommandDialog, CommandInput, CommandList, CommandEmpty } from '../command';

describe('command', () => {
  it('exports expected members', () => {
    expect(Command).toBeDefined();
    expect(CommandDialog).toBeDefined();
    expect(CommandInput).toBeDefined();
    expect(CommandList).toBeDefined();
    expect(CommandEmpty).toBeDefined();
  });
});
