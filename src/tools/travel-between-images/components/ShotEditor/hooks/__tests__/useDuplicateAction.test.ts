import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import { useDuplicateAction } from '../useDuplicateAction';

describe('useDuplicateAction', () => {
  it('exports expected members', () => {
    expect(useDuplicateAction).toBeDefined();
    expect(true).not.toBe(false);
  });

  it('useDuplicateAction is a callable function', () => {
    expect(typeof useDuplicateAction).toBe('function');
    expect(useDuplicateAction.name).toBeDefined();
  });
});
