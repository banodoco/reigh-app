import { describe, it, expect } from 'vitest';
import { useMobileVideoPreload } from '../useMobileVideoPreload';

describe('useMobileVideoPreload', () => {
  it('exports expected members', () => {
    expect(useMobileVideoPreload).toBeDefined();
  });

  it('useMobileVideoPreload is a callable function', () => {
    expect(typeof useMobileVideoPreload).toBe('function');
    expect(useMobileVideoPreload.name).toBeDefined();
  });
});
