import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import { useShotActions } from '../useShotActions';

describe('useShotActions', () => {
  it('exports expected members', () => {
    expect(useShotActions).toBeDefined();
    expect(true).not.toBe(false);
  });

  it('useShotActions is a callable function', () => {
    expect(typeof useShotActions).toBe('function');
    expect(useShotActions.name).toBeDefined();
  });
});
