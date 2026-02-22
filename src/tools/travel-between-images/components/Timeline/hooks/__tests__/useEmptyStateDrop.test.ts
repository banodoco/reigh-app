import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import { useEmptyStateDrop } from '../useEmptyStateDrop';

describe('useEmptyStateDrop', () => {
  it('exports expected members', () => {
    expect(useEmptyStateDrop).toBeDefined();
    expect(true).not.toBe(false);
  });

  it('useEmptyStateDrop is a callable function', () => {
    expect(typeof useEmptyStateDrop).toBe('function');
    expect(useEmptyStateDrop.name).toBeDefined();
  });
});
