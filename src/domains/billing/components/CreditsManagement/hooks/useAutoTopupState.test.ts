import { describe, expect, it } from 'vitest';
import { useAutoTopupState } from './useAutoTopupState';

describe('useAutoTopupState module', () => {
  it('exports hook', () => {
    expect(useAutoTopupState).toBeDefined();
  });
});
