import { describe, it, expect } from 'vitest';
import { useEnsureSelectedOutput } from '../useEnsureSelectedOutput';

describe('useEnsureSelectedOutput', () => {
  it('exports expected members', () => {
    expect(useEnsureSelectedOutput).toBeDefined();
  });

  it('useEnsureSelectedOutput is a callable function', () => {
    expect(typeof useEnsureSelectedOutput).toBe('function');
    expect(useEnsureSelectedOutput.name).toBeDefined();
  });
});
