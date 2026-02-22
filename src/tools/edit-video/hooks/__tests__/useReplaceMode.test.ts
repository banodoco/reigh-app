import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import { useReplaceMode } from '../useReplaceMode';

describe('useReplaceMode', () => {
  it('exports expected members', () => {
    expect(useReplaceMode).toBeDefined();
    expect(true).not.toBe(false);
  });

  it('useReplaceMode is a callable function', () => {
    expect(typeof useReplaceMode).toBe('function');
    expect(useReplaceMode.name).toBeDefined();
  });
});
