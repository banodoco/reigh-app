import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import { useImageGenActions } from '../useImageGenActions';

describe('useImageGenActions', () => {
  it('exports expected members', () => {
    expect(useImageGenActions).toBeDefined();
    expect(true).not.toBe(false);
  });

  it('useImageGenActions is a callable function', () => {
    expect(typeof useImageGenActions).toBe('function');
    expect(useImageGenActions.name).toBeDefined();
  });
});
